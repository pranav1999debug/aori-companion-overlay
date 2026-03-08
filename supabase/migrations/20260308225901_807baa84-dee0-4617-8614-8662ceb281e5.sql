ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS personality_type text DEFAULT 'tsundere',
ADD COLUMN IF NOT EXISTS personality_heat text DEFAULT 'mild',
ADD COLUMN IF NOT EXISTS aori_role text DEFAULT 'college_student',
ADD COLUMN IF NOT EXISTS aori_age text DEFAULT '19',
ADD COLUMN IF NOT EXISTS language_style text DEFAULT 'multilingual',
ADD COLUMN IF NOT EXISTS affection_level integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS custom_traits text[] DEFAULT '{}'::text[];