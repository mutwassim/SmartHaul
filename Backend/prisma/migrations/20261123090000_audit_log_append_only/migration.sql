-- SEC-12 / DEF-34: the administrator audit log is append-only.
-- Any UPDATE, DELETE or TRUNCATE on "AdminAuditLog" is refused for every database role,
-- including the table owner that the application connects as.
CREATE OR REPLACE FUNCTION forbid_audit_log_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AdminAuditLog is append-only: % is not allowed', TG_OP USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AdminAuditLog_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_log_change();

CREATE TRIGGER "AdminAuditLog_no_truncate"
  BEFORE TRUNCATE ON "AdminAuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_log_change();
