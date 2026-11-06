import { registerClientPlugin } from './registry';
import examplePlugin from '@webs/plugin-example/client';
import crmPlugin from '@webs/plugin-crm/client';

/**
 * Registro estático de los plugins empaquetados en el build del frontend.
 * Para añadir un plugin, importá su entrada de cliente y registralo aquí.
 */
registerClientPlugin(examplePlugin);
registerClientPlugin(crmPlugin);

export { registerClientPlugin, getClientPlugin, registerClientBlock, getClientBlock } from './registry';
