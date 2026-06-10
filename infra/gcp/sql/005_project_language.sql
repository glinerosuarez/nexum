-- 005_project_language.sql
-- Adds 'idioma' column to projects table to support per-project i18n preferences.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'projects'
          AND column_name = 'idioma'
    ) THEN
        ALTER TABLE public.projects ADD COLUMN idioma VARCHAR(2) NOT NULL DEFAULT 'en';
    END IF;
END $$;
