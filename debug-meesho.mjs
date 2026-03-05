import puppeteer from 'puppeteer';

async function debugMeesho() {
  const meeshoUrl = 'https://www.meesho.io/jobs';
  
  console.log('🔍 Debugging Meesho page structure...\n');

  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto(meeshoUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));

    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        bodyText: document.body.innerText.substring(0, 500),
        links: Array.from(document.querySelectorAll('a'))
          .slice(0, 20)
          .map(a => ({ text: a.textContent?.trim(), href: a.href })),
        divs: Array.from(document.querySelectorAll('div[class*="job"], div[class*="position"], div[class*="card"]'))
          .slice(0, 10)
          .map(d => ({ class: d.className, text: d.textContent?.substring(0, 100) })),
      };
    });

    console.log('📄 Page Title:', pageInfo.title);
    console.log('🔗 URL:', pageInfo.url);
    console.log('\n📝 Body Text (first 500 chars):');
    console.log(pageInfo.bodyText);
    console.log('\n🔗 Links found:');
    pageInfo.links.forEach((link, i) => {
      console.log(`  ${i + 1}. ${link.text} -> ${link.href}`);
    });
    console.log('\n📦 Job-related divs:');
    pageInfo.divs.forEach((div, i) => {
      console.log(`  ${i + 1}. Class: ${div.class}`);
      console.log(`     Text: ${div.text}`);
    });

    await browser.close();
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    if (browser) await browser.close();
  }
}

debugMeesho();
