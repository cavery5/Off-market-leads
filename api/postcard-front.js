// Serves postcard front HTML for Lob to fetch via remote URL.
// Lob has a 10K char limit for inline HTML, but unlimited for remote URLs.
// QR code is fetched here and inlined as SVG so Lob needs no external requests.

export default async function handler(req, res) {
  const { lid, firstName, address, city, ownerName, followup } = req.query;

  const FROM_NAME = process.env.FROM_NAME || "";
  const PHOTO_URL = process.env.PHOTO_URL || "";
  const SITE_URL  = (process.env.VITE_SITE_URL || "").replace(/\/$/, "");

  const isFollowUp = followup === "1";
  const greeting   = firstName ? `Hi ${firstName},` : "Dear Property Owner,";

  const responseUrl = `${SITE_URL}/respond.html?lid=${encodeURIComponent(lid || "")}&name=${encodeURIComponent(ownerName || "")}&addr=${encodeURIComponent((address || "") + ", " + (city || ""))}`;

  // Fetch QR code as SVG and inline it — avoids base64 bloat and external requests
  let qrContent = `<div style="width:90px;height:90px;background:#e2e8f0;"></div>`;
  try {
    const qrRes = await fetch(`https://api.qrserver.com/v1/create-qr-code/?format=svg&size=90x90&color=1a3a5c&data=${encodeURIComponent(responseUrl)}`);
    if (qrRes.ok) {
      const svg = await qrRes.text();
      qrContent = `<div style="width:90px;height:90px;">${svg}</div>`;
    }
  } catch {}

  const headerBg    = isFollowUp ? "#78350f" : "#1a3a5c";
  const labelColor  = isFollowUp ? "#fde68a" : "#c8a84b";
  const headerLabel = isFollowUp
    ? `Following Up \u2014 ${FROM_NAME}`
    : `A Personal Note from ${FROM_NAME}`;

  const bodyHtml = isFollowUp ? `
    <p>I reached out a few weeks ago about <strong>${address}</strong> and wanted to follow up one last time.</p>
    <p>I'm a local investor \u2014 I buy and hold, not flip. My goal is to build a small portfolio of well-kept buildings in <strong>${city}</strong> that I can pass on to my family. I'm not looking to displace anyone.</p>
    <p>If selling has ever crossed your mind, scan the QR code below and I'll be in touch on your schedule \u2014 no pressure, no obligation.</p>
  ` : `
    <p>I'm a local investor building a small portfolio of apartment buildings in <strong>${city}</strong> to hold long-term for my family.</p>
    <p>If you've ever thought about selling <strong>${address}</strong> \u2014 on your own timeline, no agents, no listing hassle \u2014 I'd love a private conversation.</p>
    <p>Scan the QR code below to let me know you're open to talking and I'll reach out to you directly.</p>
  `;

  const photoHtml = PHOTO_URL
    ? `<td style="vertical-align:middle;text-align:right;padding-left:16px;"><img src="${PHOTO_URL}" width="80" height="80" style="border-radius:50%;border:3px solid #1a3a5c;"></td>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { margin:0; padding:0; font-family:'Helvetica Neue',Arial,sans-serif; background:#fff; }
  h1 { font-size:27px; font-weight:700; font-style:italic; color:#1a3a5c; line-height:1.2; margin-bottom:16px; }
  p  { font-size:13.5px; color:#2d3748; line-height:1.65; margin-bottom:11px; }
  strong { color:#1a3a5c; font-weight:700; }
</style>
</head>
<body>
<table width="900" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td height="64" style="background:${headerBg};padding:0 75px;vertical-align:middle;">
      <span style="color:${labelColor};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">${headerLabel}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:36px 75px 28px;vertical-align:top;">
      <h1>${greeting}</h1>
      ${bodyHtml}
    </td>
  </tr>
  <tr>
    <td style="padding:18px 75px 36px;border-top:1.5px solid #d1d5db;vertical-align:top;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:middle;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:16px;vertical-align:middle;">${qrContent}</td>
                <td style="vertical-align:middle;">
                  <div style="font-size:12.5px;font-weight:600;color:#1a3a5c;margin-bottom:4px;">Scan to connect</div>
                  <div style="font-size:10px;color:#718096;">${SITE_URL}/respond.html</div>
                  <div style="font-size:14px;font-style:italic;color:#1a3a5c;margin-top:10px;">\u2014 ${FROM_NAME}</div>
                </td>
              </tr>
            </table>
          </td>
          ${photoHtml}
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
