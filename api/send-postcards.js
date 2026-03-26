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

const LOB_API_KEY        = process.env.LOB_API_KEY;
const FROM_NAME          = process.env.FROM_NAME;
const FROM_ADDRESS_LINE1 = process.env.FROM_ADDRESS_LINE1;
const FROM_CITY          = process.env.FROM_CITY;
const FROM_STATE         = process.env.FROM_STATE || "MA";
const FROM_ZIP           = process.env.FROM_ZIP;
const SITE_URL           = (process.env.VITE_SITE_URL || "").replace(/\/$/, "");

function getFirstName(ownerName, ownerType) {
  if (["LLC", "Trust", "Estate"].includes(ownerType)) return null;
  const comma = ownerName.indexOf(",");
  if (comma > -1) return ownerName.slice(comma + 1).trim().split(" ")[0];
  return ownerName.split(" ")[0];
}

function buildFront(lead) {
  const firstName   = getFirstName(lead.ownerName, lead.ownerType);
  const greeting    = firstName ? `Hi ${firstName},` : "Dear Property Owner,";
  const responseUrl = `${SITE_URL}/respond.html?lid=${lead.id}&name=${encodeURIComponent(lead.ownerName)}&addr=${encodeURIComponent(lead.address + ", " + lead.city)}`;
  const qrUrl       = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&color=1a3a5c&data=${encodeURIComponent(responseUrl)}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1800px; height: 2700px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    background: #ffffff;
    padding: 220px 210px 180px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .eyebrow {
    display: inline-block;
    background: #1a3a5c;
    color: #ffffff;
    font-size: 52px;
    font-weight: 700;
    letter-spacing: 5px;
    text-transform: uppercase;
    padding: 20px 44px;
    margin-bottom: 90px;
  }
  h1 { font-size: 130px; font-weight: 700; color: #1a3a5c; line-height: 1.1; margin-bottom: 70px; }
  p  { font-size: 70px; color: #333333; line-height: 1.55; margin-bottom: 44px; }
  strong { color: #1a3a5c; }
  .divider { border: none; border-top: 5px solid #1a3a5c; margin: 60px 0; }
  .cta { display: flex; align-items: center; gap: 80px; }
  .cta-text { font-size: 62px; color: #1a3a5c; font-weight: 600; line-height: 1.4; }
  .cta-url  { font-size: 50px; color: #888; margin-top: 14px; word-break: break-all; }
  .sig { font-size: 70px; font-style: italic; color: #1a3a5c; }
</style>
</head>
<body>
  <div>
    <div class="eyebrow">Private &amp; Confidential</div>
    <h1>${greeting}</h1>
    <p>I'm a local investor actively looking to buy multifamily properties in <strong>${lead.city}</strong>.</p>
    <p>I came across your property at <strong>${lead.address}</strong> and would love a quick, private conversation about whether you'd consider selling.</p>
    <p><strong>No agents. No listing fees. No pressure.</strong></p>
  </div>
  <div>
    <hr class="divider">
    <div class="cta">
      <img src="${qrUrl}" width="260" height="260" alt="Scan to respond">
      <div>
        <div class="cta-text">Scan to let me know you're open to a conversation</div>
        <div class="cta-url">${SITE_URL}/respond.html</div>
      </div>
    </div>
    <div style="margin-top:80px" class="sig">— ${FROM_NAME}</div>
  </div>
</body>
</html>`;
}

function buildFollowUpFront(lead) {
  const firstName   = getFirstName(lead.ownerName, lead.ownerType);
  const greeting    = firstName ? `Hi ${firstName},` : "Dear Property Owner,";
  const responseUrl = `${SITE_URL}/respond.html?lid=${lead.id}&name=${encodeURIComponent(lead.ownerName)}&addr=${encodeURIComponent(lead.address + ", " + lead.city)}`;
  const qrUrl       = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&color=1a3a5c&data=${encodeURIComponent(responseUrl)}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1800px; height: 2700px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    background: #ffffff;
    padding: 220px 210px 180px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .eyebrow {
    display: inline-block;
    background: #78350f;
    color: #ffffff;
    font-size: 52px;
    font-weight: 700;
    letter-spacing: 5px;
    text-transform: uppercase;
    padding: 20px 44px;
    margin-bottom: 90px;
  }
  h1 { font-size: 130px; font-weight: 700; color: #1a3a5c; line-height: 1.1; margin-bottom: 70px; }
  p  { font-size: 70px; color: #333333; line-height: 1.55; margin-bottom: 44px; }
  strong { color: #1a3a5c; }
  .divider { border: none; border-top: 5px solid #1a3a5c; margin: 60px 0; }
  .cta { display: flex; align-items: center; gap: 80px; }
  .cta-text { font-size: 62px; color: #1a3a5c; font-weight: 600; line-height: 1.4; }
  .cta-url  { font-size: 50px; color: #888; margin-top: 14px; word-break: break-all; }
  .sig { font-size: 70px; font-style: italic; color: #1a3a5c; }
</style>
</head>
<body>
  <div>
    <div class="eyebrow">Following Up</div>
    <h1>${greeting}</h1>
    <p>I reached out recently about your property at <strong>${lead.address}</strong> — I wanted to follow up in case my letter got lost in the shuffle.</p>
    <p>I'm still very interested in a private conversation about <strong>${lead.city}</strong> multifamily. If the timing is ever right, I'd love to hear from you.</p>
    <p><strong>No agents. No fees. No pressure.</strong></p>
  </div>
  <div>
    <hr class="divider">
    <div class="cta">
      <img src="${qrUrl}" width="260" height="260" alt="Scan to respond">
      <div>
        <div class="cta-text">Scan to let me know you're open to a conversation</div>
        <div class="cta-url">${SITE_URL}/respond.html</div>
      </div>
    </div>
    <div style="margin-top:80px" class="sig">— ${FROM_NAME}</div>
  </div>
</body>
</html>`;
}

function buildBack() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1800px; height: 2700px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    background: #ffffff;
    position: relative;
  }
  .left {
    position: absolute;
    left: 0; top: 0;
    width: 860px; height: 2700px;
    padding: 220px 150px;
    border-right: 4px solid #e5e7eb;
  }
  .left h2 { font-size: 90px; font-weight: 700; color: #1a3a5c; line-height: 1.2; margin-bottom: 70px; }
  .left p  { font-size: 62px; color: #555; line-height: 1.6; margin-bottom: 50px; }
  .address-block {
    position: absolute;
    right: 90px;
    bottom: 380px;
    width: 800px;
    font-size: 62px;
    line-height: 1.6;
    color: #111;
  }
</style>
</head>
<body>
  <div class="left">
    <h2>Thinking about selling?</h2>
    <p>I purchase multifamily properties directly — no listings, no commissions, no hassle.</p>
    <p>If the timing is ever right, I'd love to hear from you.</p>
  </div>
  <div class="address-block">{{address_block}}</div>
</body>
</html>`;
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
          description: `Outreach — ${lead.address}, ${lead.city}`,
          to,
          from,
          size:  "6x9",
          front: (lead.mailHistory?.length ?? 0) > 0 ? buildFollowUpFront(lead) : buildFront(lead),
          back:  buildBack(),
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
