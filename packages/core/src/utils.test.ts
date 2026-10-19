import { describe, expect, it } from 'vitest';
import { slugify, totalPages, normalizePagination, mask } from './utils';

describe('slugify', () => {
  it('convierte texto a slug', () => {
    expect(slugify('Hola Mundo')).toBe('hola-mundo');
  });
  it('elimina acentos y caracteres especiales', () => {
    expect(slugify('Canción de Año Nuevo')).toBe('cancion-de-ano-nuevo');
  });
  it('colapsa guiones y recorta extremos', () => {
    expect(slugify('  --  A  B  -- ')).toBe('a-b');
  });
  it('devuelve vacío para entrada vacía', () => {
    expect(slugify('')).toBe('');
  });
});

describe('totalPages', () => {
  it('redondea hacia arriba', () => {
    expect(totalPages(21, 10)).toBe(3);
  });
  it('mínimo 1 página', () => {
    expect(totalPages(0, 10)).toBe(1);
  });
  it('devuelve 0 si pageSize <= 0', () => {
    expect(totalPages(10, 0)).toBe(0);
  });
});

describe('normalizePagination', () => {
  it('aplica defaults', () => {
    expect(normalizePagination(undefined, { pageSize: 20, maxPageSize: 100 })).toEqual({ page: 0, pageSize: 20 });
  });
  it('no permite página negativa ni pageSize > max', () => {
    expect(normalizePagination({ page: -1, pageSize: 999 }, { maxPageSize: 50 })).toEqual({ page: 0, pageSize: 50 });
  });
  it('respeta pageSize mínimo 1', () => {
    expect(normalizePagination({ page: 2, pageSize: 0 }, {})).toEqual({ page: 2, pageSize: 1 });
  });
});

describe('mask', () => {
  it('enmascara dejando los últimos 4', () => {
    expect(mask('abcdefgh', 2)).toBe('******gh');
    expect(mask('secret-token-1234')).toBe('*************1234');
  });
  it('enmascara todo si es corto', () => {
    expect(mask('abc')).toBe('***');
  });
});
