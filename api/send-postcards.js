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
const FROM_PHONE         = process.env.FROM_PHONE || "";
const PHOTO_URL          = process.env.PHOTO_URL || "";   // optional headshot URL
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
  const qrUrl       = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=1a3a5c&data=${encodeURIComponent(responseUrl)}`;

  const photoHtml = PHOTO_URL
    ? `<img src="${PHOTO_URL}" alt="${FROM_NAME}" style="position:absolute;bottom:160px;right:160px;width:220px;height:220px;border-radius:50%;object-fit:cover;border:5px solid #1a3a5c;">`
    : "";

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
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .header {
    background: #1a3a5c;
    padding: 52px 160px;
    flex-shrink: 0;
  }
  .header-label {
    color: #c8a84b;
    font-size: 34px;
    font-weight: 700;
    letter-spacing: 7px;
    text-transform: uppercase;
  }
  .body {
    flex: 1;
    padding: 90px 160px 60px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  h1 {
    font-size: 76px;
    font-weight: 700;
    font-style: italic;
    color: #1a3a5c;
    line-height: 1.15;
    margin-bottom: 52px;
  }
  p {
    font-size: 47px;
    color: #2d3748;
    line-height: 1.65;
    margin-bottom: 36px;
  }
  strong { color: #1a3a5c; font-weight: 700; }
  .footer {
    border-top: 3px solid #1a3a5c;
    padding-top: 52px;
  }
  .cta { display: flex; align-items: center; gap: 60px; }
  .cta-label { font-size: 46px; font-weight: 600; color: #1a3a5c; margin-bottom: 14px; }
  .cta-url   { font-size: 36px; color: #718096; }
  .sig { font-size: 54px; font-style: italic; color: #1a3a5c; margin-top: 44px; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-label">A Personal Note from ${FROM_NAME}</div>
  </div>
  <div class="body">
    <div>
      <h1>${greeting}</h1>
      <p>I'm a local investor building a small portfolio of apartment buildings in <strong>${lead.city}</strong> to hold long-term for my family.</p>
      <p>If you've ever thought about selling <strong>${lead.address}</strong> — on your own timeline, no agents, no listing hassle — I'd love a private conversation.</p>
      <p>Scan the QR code below to let me know you're open to talking and I'll reach out to you directly.</p>
    </div>
    <div class="footer">
      <div class="cta">
        <img src="${qrUrl}" width="200" height="200" alt="Scan to respond">
        <div>
          <div class="cta-label">Scan to connect</div>
          <div class="cta-url">${SITE_URL}/respond.html</div>
        </div>
      </div>
      <div class="sig">— ${FROM_NAME}</div>
    </div>
  </div>
  ${photoHtml}
</body>
</html>`;
}

function buildFollowUpFront(lead) {
  const firstName   = getFirstName(lead.ownerName, lead.ownerType);
  const greeting    = firstName ? `Hi ${firstName},` : "Dear Property Owner,";
  const responseUrl = `${SITE_URL}/respond.html?lid=${lead.id}&name=${encodeURIComponent(lead.ownerName)}&addr=${encodeURIComponent(lead.address + ", " + lead.city)}`;
  const qrUrl       = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=1a3a5c&data=${encodeURIComponent(responseUrl)}`;

  const photoHtml = PHOTO_URL
    ? `<img src="${PHOTO_URL}" alt="${FROM_NAME}" style="position:absolute;bottom:160px;right:160px;width:220px;height:220px;border-radius:50%;object-fit:cover;border:5px solid #1a3a5c;">`
    : "";

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
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .header {
    background: #78350f;
    padding: 52px 160px;
    flex-shrink: 0;
  }
  .header-label {
    color: #fde68a;
    font-size: 34px;
    font-weight: 700;
    letter-spacing: 7px;
    text-transform: uppercase;
  }
  .body {
    flex: 1;
    padding: 90px 160px 60px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  h1 {
    font-size: 76px;
    font-weight: 700;
    font-style: italic;
    color: #1a3a5c;
    line-height: 1.15;
    margin-bottom: 52px;
  }
  p {
    font-size: 47px;
    color: #2d3748;
    line-height: 1.65;
    margin-bottom: 36px;
  }
  strong { color: #1a3a5c; font-weight: 700; }
  .footer {
    border-top: 3px solid #1a3a5c;
    padding-top: 52px;
  }
  .cta { display: flex; align-items: center; gap: 60px; }
  .cta-label { font-size: 46px; font-weight: 600; color: #1a3a5c; margin-bottom: 14px; }
  .cta-url   { font-size: 36px; color: #718096; }
  .sig { font-size: 54px; font-style: italic; color: #1a3a5c; margin-top: 44px; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-label">Following Up — ${FROM_NAME}</div>
  </div>
  <div class="body">
    <div>
      <h1>${greeting}</h1>
      <p>I reached out a few weeks ago about <strong>${lead.address}</strong> and wanted to follow up one last time.</p>
      <p>I'm a local investor — I buy and hold, not flip. My goal is to build a small portfolio of well-kept buildings in <strong>${lead.city}</strong> that I can pass on to my family. I'm not looking to displace anyone.</p>
      <p>If selling has ever crossed your mind, scan the QR code below and I'll be in touch on your schedule — no pressure, no obligation.</p>
    </div>
    <div class="footer">
      <div class="cta">
        <img src="${qrUrl}" width="200" height="200" alt="Scan to respond">
        <div>
          <div class="cta-label">Scan to connect</div>
          <div class="cta-url">${SITE_URL}/respond.html</div>
        </div>
      </div>
      <div class="sig">— ${FROM_NAME}</div>
    </div>
  </div>
  ${photoHtml}
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
    width: 880px; height: 2700px;
    border-right: 3px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 120px 130px;
  }
  .left-accent {
    width: 80px;
    height: 8px;
    background: #c8a84b;
    margin-bottom: 50px;
  }
  .left h2 {
    font-size: 64px;
    font-weight: 700;
    color: #1a3a5c;
    line-height: 1.25;
    margin-bottom: 50px;
  }
  .left p {
    font-size: 44px;
    color: #4a5568;
    line-height: 1.65;
    margin-bottom: 36px;
  }
  .left .from {
    font-size: 40px;
    color: #1a3a5c;
    font-style: italic;
    margin-top: 20px;
  }
  .address-block {
    position: absolute;
    right: 100px;
    bottom: 360px;
    width: 780px;
    font-size: 46px;
    line-height: 1.6;
    color: #111;
  }
</style>
</head>
<body>
  <div class="left">
    <div class="left-accent"></div>
    <h2>Thinking about selling your property?</h2>
    <p>I purchase multifamily buildings directly — no listings, no commissions, no hassle.</p>
    <p>If the timing is ever right for you, I'd genuinely love to connect.</p>
    <div class="from">— ${FROM_NAME}</div>
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
