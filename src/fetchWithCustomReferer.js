const fetch = require('node-fetch');

async function fetchWithCustomReferer(url, refererUrl) {
  if (!url) throw new Error("URL is required");
  
  try {
    const response = await fetch(url, {
      headers: {
        "Referer": refererUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Origin": new URL(refererUrl).origin,
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
      },
      redirect: 'follow',
      timeout: 10000 // 10 second timeout
    });

    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

module.exports = { fetchWithCustomReferer };
