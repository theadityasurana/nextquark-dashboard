-- Update detailed_requirements to store Markdown format instead of HTML
-- This makes it compatible with both web and React Native mobile apps
-- Markdown can be rendered on web using react-markdown
-- Markdown can be rendered on mobile using react-native-markdown-display

-- No schema change needed - we'll just change what we store in detailed_requirements
-- It will now contain Markdown instead of HTML

COMMENT ON COLUMN jobs.detailed_requirements IS 'Job description in Markdown format (compatible with web and React Native)';
