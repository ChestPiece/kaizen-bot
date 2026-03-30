CREATE OR REPLACE FUNCTION add_lead_note_and_touch_lead(
  p_lead_id UUID,
  p_agent_id UUID,
  p_content TEXT,
  p_created_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS lead_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_note lead_notes;
BEGIN
  UPDATE leads
  SET last_contacted_at = p_created_at
  WHERE id = p_lead_id
    AND assigned_to = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found or not assigned to you';
  END IF;

  INSERT INTO lead_notes (lead_id, content, created_by, created_at)
  VALUES (p_lead_id, p_content, p_agent_id, p_created_at)
  RETURNING * INTO inserted_note;

  RETURN inserted_note;
END;
$$;