-- Migration: Convert gallery images to unlimited array storage
-- Date: 2025-08-08
-- Description: Replace individual gallery_image_1-5 columns with single gallery_images JSON array field

-- Add new gallery_images field as TEXT to store JSON array
ALTER TABLE users ADD COLUMN IF NOT EXISTS gallery_images TEXT;

-- Migrate existing gallery data to new format
UPDATE users 
SET gallery_images = (
    SELECT json_agg(url)::text 
    FROM (
        SELECT gallery_image_1 as url WHERE gallery_image_1 IS NOT NULL
        UNION ALL
        SELECT gallery_image_2 as url WHERE gallery_image_2 IS NOT NULL
        UNION ALL
        SELECT gallery_image_3 as url WHERE gallery_image_3 IS NOT NULL
        UNION ALL
        SELECT gallery_image_4 as url WHERE gallery_image_4 IS NOT NULL
        UNION ALL
        SELECT gallery_image_5 as url WHERE gallery_image_5 IS NOT NULL
    ) AS gallery_urls
    WHERE gallery_urls.url IS NOT NULL
)
WHERE role = 'student' 
AND (gallery_image_1 IS NOT NULL OR gallery_image_2 IS NOT NULL OR gallery_image_3 IS NOT NULL OR gallery_image_4 IS NOT NULL OR gallery_image_5 IS NOT NULL);

-- Drop old individual gallery columns after migration
-- Note: Uncomment these after verifying the migration works correctly
-- ALTER TABLE users DROP COLUMN IF EXISTS gallery_image_1;
-- ALTER TABLE users DROP COLUMN IF EXISTS gallery_image_2;
-- ALTER TABLE users DROP COLUMN IF EXISTS gallery_image_3;
-- ALTER TABLE users DROP COLUMN IF EXISTS gallery_image_4;
-- ALTER TABLE users DROP COLUMN IF EXISTS gallery_image_5;

-- Add comment to document the new field
COMMENT ON COLUMN users.gallery_images IS 'JSON array of gallery image URLs as text, supports unlimited images';
