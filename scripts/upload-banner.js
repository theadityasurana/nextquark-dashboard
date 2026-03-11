require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function uploadBanner() {
  // First, create the bucket if it doesn't exist
  const { data: buckets } = await supabase.storage.listBuckets()
  const publicBucket = buckets?.find(b => b.name === 'email-assets')
  
  if (!publicBucket) {
    const { error: bucketError } = await supabase.storage.createBucket('email-assets', {
      public: true
    })
    if (bucketError) {
      console.error('Bucket creation error:', bucketError)
      return
    }
    console.log('Created email-assets bucket')
  }

  const filePath = path.join(__dirname, '../public/email-banner.png')
  const fileBuffer = fs.readFileSync(filePath)

  const { data, error } = await supabase.storage
    .from('email-assets')
    .upload('email-banner.png', fileBuffer, {
      contentType: 'image/png',
      upsert: true
    })

  if (error) {
    console.error('Upload error:', error)
    return
  }

  const { data: { publicUrl } } = supabase.storage
    .from('email-assets')
    .getPublicUrl('email-banner.png')

  console.log('Banner uploaded successfully!')
  console.log('Public URL:', publicUrl)
}

uploadBanner()
