-- Datos del receptor: domicilio (AFIP/ARCA exige domicilio en ciertos comprobantes).
ALTER TABLE "invoices" ADD COLUMN "customerAddress" TEXT;
