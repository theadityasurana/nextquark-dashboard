// Replace the onClick handler in the "Fetch & Preview" button with this:

onClick={async () => {
  if (!batchCompanyId || !batchPortalUrl || isScraping) return
  setIsScraping(true)
  try {
    const response = await fetch("/api/scraper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portalUrl: batchPortalUrl }),
    })
    const data = await response.json()
    console.log("Scraped jobs response:", data)
    
    if (!data.jobs || data.jobs.length === 0) {
      alert("No jobs found. The portal might require JavaScript rendering or the URL might be incorrect.")
      setIsScraping(false)
      return
    }
    
    setScrapedJobs(data.jobs)
    setCurrentJobIndex(0)
  } catch (error) {
    console.error("Scraping error:", error)
    alert("Failed to scrape jobs. Please check the URL and try again.")
  } finally {
    setIsScraping(false)
  }
}}
