ALTER TABLE items ADD COLUMN IF NOT EXISTS categoria_padre VARCHAR(100);

UPDATE items SET categoria_padre = 'WalkTest Kits' WHERE nombre ILIKE '%Walk%Test%' OR nombre ILIKE '%Scanner%' OR nombre ILIKE '%PCTEL%' OR nombre ILIKE '%S22%' OR nombre ILIKE '%Samsung%';
UPDATE items SET categoria_padre = 'PIM Testers' WHERE nombre ILIKE '%PIM%' OR nombre ILIKE '%Kaelus%' OR nombre ILIKE '%Opti%';
UPDATE items SET categoria_padre = 'Sweep Testers' WHERE nombre ILIKE '%Sweep%' OR nombre ILIKE '%Site Master%' OR nombre ILIKE '%S331L%';
UPDATE items SET categoria_padre = 'CW Testers' WHERE nombre ILIKE '%CW%' OR nombre ILIKE '%Consultix%';
UPDATE items SET categoria_padre = 'Levelling Kits' WHERE nombre ILIKE '%Level%' OR nombre ILIKE '%Kit%';
UPDATE items SET categoria_padre = 'CAM Keys' WHERE nombre ILIKE '%Key%';
UPDATE items SET categoria_padre = 'Safety & PPE' WHERE nombre ILIKE '%Harness%' OR nombre ILIKE '%Lanyard%' OR nombre ILIKE '%Rope%' OR nombre ILIKE '%Helmet%' OR nombre ILIKE '%Ladder%' OR nombre ILIKE '%Carabiner%';
UPDATE items SET categoria_padre = 'Consumables' WHERE nombre ILIKE '%Tape%' OR nombre ILIKE '%Label%' OR nombre ILIKE '%Extinguisher%' OR nombre ILIKE '%First Aid%' OR nombre ILIKE '%SIM%' OR nombre ILIKE '%Ferrule%';
UPDATE items SET categoria_padre = 'Handy Tools' WHERE categoria_padre IS NULL;
