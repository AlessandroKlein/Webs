import { createGeneratedClient, type GeneratedRecord } from '../client';

/** Datos del recurso «testimonials» (Testimonios). */
export interface Testimonials {
  /** Nombre del autor */
  author: string;
  /** Texto del testimonio */
  content: string;
  rating?: number;
  featured?: boolean;
  tags?: Array<string>;
}

/** Tipo de entrada para crear/actualizar un registro de «testimonials». */
export type TestimonialsInput = Testimonials;

/** Registro persistido de «testimonials». */
export type TestimonialsRecord = GeneratedRecord<Testimonials>;

/** Cliente tipado del recurso generado «testimonials» (ADR-0020). */
export const testimonials = createGeneratedClient<Testimonials>('testimonials');
