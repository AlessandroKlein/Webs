import { registerClientBlock } from './registry';
import exampleBlock from '@webs/block-example/client';

/**
 * Registro estático de los bloques empaquetados en el build del frontend.
 * Para añadir un bloque, importá su entrada de cliente y registralo aquí.
 */
registerClientBlock(exampleBlock);

export { registerClientBlock, getClientBlock } from './registry';
