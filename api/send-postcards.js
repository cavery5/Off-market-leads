// Vercel Serverless Function: /api/send-postcards
// Calls Lob API to mail a 6x9 postcard to each provided lead.
//
// Set these in Vercel dashboard → Project → Settings → Environment Variables:
//   LOB_API_KEY          — from lob.com (test_... for testing, live_... for real mail)
//   FROM_NAME            — your full name (e.g. "Chris Avery")
//   FROM_ADDRESS_LINE1   — your street address
//   FROM_CITY            — your city
//   FROM_STATE           — your state (default: MA)
//   FROM_ZIP             — your zip code
//   VITE_SITE_URL        — your Vercel site URL (e.g. https://yoursite.vercel.app)
//   PHOTO_URL            — (optional) publicly accessible headshot image URL

const LOB_API_KEY        = process.env.LOB_API_KEY;
const FROM_NAME          = process.env.FROM_NAME;
const FROM_ADDRESS_LINE1 = process.env.FROM_ADDRESS_LINE1;
const FROM_CITY          = process.env.FROM_CITY;
const FROM_STATE         = process.env.FROM_STATE || "MA";
const FROM_ZIP           = process.env.FROM_ZIP;
const PHOTO_URL          = process.env.PHOTO_URL || "";
const SITE_URL           = (process.env.VITE_SITE_URL || "").replace(/\/$/, "");

function getFirstName(ownerName, ownerType) {
  if (["LLC", "Trust", "Estate"].includes(ownerType)) return null;
  const comma = ownerName.indexOf(",");
  if (comma > -1) return ownerName.slice(comma + 1).trim().split(" ")[0];
  return ownerName.split(" ")[0];
}

// Back is short enough to inline (no images, just text + {{address_block}})
function buildBack() {
  const photoHtml = PHOTO_URL
    ? `<img src="${PHOTO_URL}" width="60" height="60" style="border-radius:50%;border:2px solid #1a3a5c;margin-bottom:10px;display:block;">`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{margin:0;padding:0;box-sizing:border-box;}body{margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;}</style>
</head><body>
<table width="900" height="1350" cellpadding="0" cellspacing="0" border="0" style="height:1350px;">
<tr>
<td width="440" style="border-right:1.5px solid #e2e8f0;padding:60px 48px;vertical-align:middle;">
<div style="width:36px;height:4px;background:#c8a84b;margin-bottom:18px;"></div>
<div style="font-size:20px;font-weight:700;color:#1a3a5c;line-height:1.3;margin-bottom:14px;">Thinking about selling your property?</div>
<div style="font-size:13px;color:#4a5568;line-height:1.65;margin-bottom:10px;">I purchase multifamily buildings directly \u2014 no listings, no commissions, no hassle.</div>
<div style="font-size:13px;color:#4a5568;line-height:1.65;margin-bottom:18px;">If the timing is ever right, I'd genuinely love to connect.</div>
${photoHtml}
<div style="font-size:13px;font-style:italic;color:#1a3a5c;">\u2014 ${FROM_NAME}</div>
</td>
<td style="vertical-align:bottom;padding:0 40px 170px;">
<div style="font-size:13px;line-height:1.6;color:#111;">{{address_block}}</div>
</td>
</tr>
</table>
</body></html>`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  if (!LOB_API_KEY)        return res.status(500).json({ error: "LOB_API_KEY is not set" });
  if (!FROM_NAME)          return res.status(500).json({ error: "FROM_NAME is not set" });
  if (!FROM_ADDRESS_LINE1) return res.status(500).json({ error: "FROM_ADDRESS_LINE1 is not set" });
  if (!FROM_CITY)          return res.status(500).json({ error: "FROM_CITY is not set" });
  if (!FROM_ZIP)           return res.status(500).json({ error: "FROM_ZIP is not set" });
  if (!SITE_URL)           return res.status(500).json({ error: "VITE_SITE_URL is not set" });

  const { leads } = req.body;
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: "No leads provided" });
  }

  const from = {
    name:            FROM_NAME,
    address_line1:   FROM_ADDRESS_LINE1,
    address_city:    FROM_CITY,
    address_state:   FROM_STATE,
    address_zip:     FROM_ZIP,
    address_country: "US",
  };

  const authHeader = "Basic " + Buffer.from(LOB_API_KEY + ":").toString("base64");
  const backHtml   = buildBack();
  const results    = [];

  for (const lead of leads) {
    const addrLine1 = lead.ownerStreet || lead.address;
    const addrCity  = lead.ownerCity   || lead.city;
    const addrState = lead.ownerState  || "MA";
    const addrZip   = lead.ownerZip    || "";

    if (!addrLine1 || !addrCity || !addrZip) {
      results.push({ id: lead.id, status: "skipped", reason: "Missing mailing address fields (need street, city, zip)" });
      continue;
    }

    const isFollowUp = (lead.mailHistory?.length ?? 0) > 0;
    const firstName  = getFirstName(lead.ownerName, lead.ownerType) || "";

    // Pass a URL so Lob fetches the HTML — avoids the 10K char inline limit
    const frontParams = new URLSearchParams({
      lid:       lead.id,
      firstName,
      address:   lead.address,
      city:      lead.city,
      ownerName: lead.ownerName,
      followup:  isFollowUp ? "1" : "0",
    });
    const frontUrl = `${SITE_URL}/api/postcard-front?${frontParams.toString()}`;

    const to = {
      name:            lead.ownerName,
      address_line1:   addrLine1,
      address_city:    addrCity,
      address_state:   addrState,
      address_zip:     addrZip,
      address_country: "US",
    };

    try {
      const lobRes = await fetch("https://api.lob.com/v1/postcards", {
        method:  "POST",
        headers: { "Authorization": authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          description: `Outreach \u2014 ${lead.address}, ${lead.city}`,
          to,
          from,
          size:  "6x9",
          front: frontUrl,
          back:  backHtml,
        }),
      });

      const data = await lobRes.json();
      if (lobRes.ok) {
        results.push({ id: lead.id, lobId: data.id, expectedDelivery: data.expected_delivery_date, status: "sent" });
      } else {
        results.push({ id: lead.id, status: "failed", reason: data.error?.message || JSON.stringify(data) });
      }
    } catch (err) {
      results.push({ id: lead.id, status: "failed", reason: err.message });
    }
  }

  return res.status(200).json({ results });
}
