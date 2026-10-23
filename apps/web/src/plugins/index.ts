import { registerClientPlugin } from './registry';
import examplePlugin from '@webs/plugin-example/client';

/**
 * Registro estático de los plugins empaquetados en el build del frontend.
 * Para añadir un plugin, importá su entrada de cliente y registralo aquí.
 */
registerClientPlugin(examplePlugin);

export { registerClientPlugin, getClientPlugin, registerClientBlock, getClientBlock } from './registry';
