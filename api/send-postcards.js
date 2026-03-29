// Vercel Serverless Function: /api/send-postcards
// Calls Lob API to mail a 6x9 postcard to each provided lead.
//
// Set these in Vercel dashboard → Project → Settings → Environment Variables:
//   LOB_API_KEY          — from lob.com
//   FROM_NAME, FROM_ADDRESS_LINE1, FROM_CITY, FROM_STATE, FROM_ZIP
//   VITE_SITE_URL        — your Vercel app URL
//   PHOTO_URL            — (optional) public headshot image URL

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

async function fetchBase64(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return "data:image/png;base64," + Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

function buildFront(lead, qrDataUri, isFollowUp) {
  const firstName   = getFirstName(lead.ownerName, lead.ownerType);
  const greeting    = firstName ? `Hi ${firstName},` : "Dear Property Owner,";
  const headerBg    = isFollowUp ? "#78350f" : "#1a3a5c";
  const labelColor  = isFollowUp ? "#fde68a" : "#c8a84b";
  const headerLabel = isFollowUp ? `Following Up - ${FROM_NAME}` : `A Personal Note from ${FROM_NAME}`;

  const body = isFollowUp
    ? `<p>I reached out a few weeks ago about <b>${lead.address}</b> and wanted to follow up one last time.</p>
       <p>I'm a local investor - I buy and hold, not flip. My goal is to build a small portfolio of well-kept buildings in <b>${lead.city}</b> that I can pass on to my family.</p>
       <p>If selling has ever crossed your mind, scan below and I'll be in touch on your schedule - no pressure.</p>`
    : `<p>I'm a local investor building a small portfolio of apartment buildings in <b>${lead.city}</b> to hold long-term for my family.</p>
       <p>If you've ever thought about selling <b>${lead.address}</b> - on your own timeline, no agents, no listing hassle - I'd love a private conversation.</p>
       <p>Scan the QR code below to let me know you're open to talking.</p>`;

  const qrTag  = qrDataUri  ? `<img src="${qrDataUri}" width="75" height="75">` : `<div style="width:75px;height:75px;background:#ddd"></div>`;
  const photoTag = PHOTO_URL ? `<img src="${PHOTO_URL}" width="75" height="75" style="border-radius:50%;border:2px solid #1a3a5c;object-fit:cover">` : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;background:#fff}
p{font-size:13px;color:#333;line-height:1.6;margin-bottom:10px}
b{color:#1a3a5c;font-weight:700}
</style></head><body>
<table width="900" cellpadding="0" cellspacing="0">
<tr><td height="60" bgcolor="${headerBg}" style="padding:0 70px">
<span style="color:${labelColor};font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase">${headerLabel}</span>
</td></tr>
<tr><td style="padding:30px 70px 20px;vertical-align:top">
<p style="font-size:24px;font-weight:700;font-style:italic;color:#1a3a5c;margin-bottom:14px">${greeting}</p>
${body}
</td></tr>
<tr><td style="padding:16px 70px 30px;border-top:1px solid #ddd">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:75px">${qrTag}</td>
<td style="vertical-align:middle;padding-left:14px">
<div style="font-size:11px;font-weight:700;color:#1a3a5c">Scan to connect</div>
<div style="font-size:9px;color:#888;margin-top:3px">${SITE_URL}/respond.html</div>
<div style="font-size:12px;font-style:italic;color:#1a3a5c;margin-top:8px">- ${FROM_NAME}</div>
</td>
<td style="vertical-align:middle;text-align:right">${photoTag}</td>
</tr></table>
</td></tr>
</table></body></html>`;
}

function buildBack() {
  const photo = PHOTO_URL ? `<img src="${PHOTO_URL}" width="55" height="55" style="border-radius:50%;border:2px solid #1a3a5c;display:block;margin-bottom:10px">` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#fff">
<table width="900" height="1350" cellpadding="0" cellspacing="0" style="height:1350px">
<tr>
<td width="430" style="border-right:1px solid #e2e8f0;padding:50px 44px;vertical-align:middle">
<div style="width:32px;height:4px;background:#c8a84b;margin-bottom:16px"></div>
<div style="font-size:18px;font-weight:700;color:#1a3a5c;line-height:1.3;margin-bottom:13px">Thinking about selling your property?</div>
<div style="font-size:12px;color:#4a5568;line-height:1.6;margin-bottom:10px">I purchase multifamily buildings directly - no listings, no commissions, no hassle.</div>
<div style="font-size:12px;color:#4a5568;line-height:1.6;margin-bottom:16px">If the timing is ever right, I'd genuinely love to connect.</div>
${photo}<div style="font-size:12px;font-style:italic;color:#1a3a5c">- ${FROM_NAME}</div>
</td>
<td style="vertical-align:bottom;padding:0 36px 160px 36px">
<div style="font-size:12px;line-height:1.6;color:#111">{{address_block}}</div>
</td>
</tr>
</table></body></html>`;
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
      results.push({ id: lead.id, status: "skipped", reason: "Missing mailing address fields" });
      continue;
    }

    const isFollowUp  = (lead.mailHistory?.length ?? 0) > 0;
    const responseUrl = `${SITE_URL}/respond.html?lid=${lead.id}&name=${encodeURIComponent(lead.ownerName)}&addr=${encodeURIComponent(lead.address + ", " + lead.city)}`;

    // Fetch QR as small PNG (60x60) and embed as base64 — ~2KB, well within 10K HTML limit
    const qrDataUri = await fetchBase64(
      `https://api.qrserver.com/v1/create-qr-code/?size=75x75&format=png&color=1a3a5c&data=${encodeURIComponent(responseUrl)}`
    );

    const frontHtml = buildFront(lead, qrDataUri, isFollowUp);

    // Log HTML size to Vercel logs for debugging
    console.log(`[postcard] lead=${lead.id} frontHtmlLen=${frontHtml.length} backHtmlLen=${backHtml.length}`);

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
          description: `Outreach - ${lead.address}, ${lead.city}`,
          to,
          from,
          size:  "6x9",
          front: frontHtml,
          back:  backHtml,
        }),
      });

      const data = await lobRes.json();
      if (lobRes.ok) {
        results.push({ id: lead.id, lobId: data.id, expectedDelivery: data.expected_delivery_date, status: "sent" });
      } else {
        // Return full Lob error for easier debugging
        results.push({ id: lead.id, status: "failed", reason: data.error?.message || JSON.stringify(data) });
      }
    } catch (err) {
      results.push({ id: lead.id, status: "failed", reason: err.message });
    }
  }

  return res.status(200).json({ results });
}
