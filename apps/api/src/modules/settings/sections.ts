import { registerSettingSection } from './registry';
import {
  LEGAL_COOKIES_TEMPLATE,
  LEGAL_DISCLAIMER_TEMPLATE,
  LEGAL_PRIVACY_TEMPLATE,
  LEGAL_TERMS_TEMPLATE,
} from './legal-templates';

/**
 * Secciones de ajustes base de la plataforma. Todo lo que el administrador
 * edita desde la UI (nombre del sitio, logo, colores/CSS, SEO, políticas,
 * contacto, redes) vive aquí y se renderiza automáticamente a partir del
 * esquema JSON de cada sección.
 */
export function registerDefaultSections(): void {
  registerSettingSection({
    key: 'site',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Sitio (identidad)',
      properties: {
        name: { type: 'string', title: 'Nombre del sitio' },
        tagline: { type: 'string', title: 'Lema / descripción corta' },
      },
    },
    defaults: { name: 'Webs', tagline: '' },
  });

  registerSettingSection({
    key: 'branding',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Imágenes y logo',
      properties: {
        logoUrl: { type: 'string', format: 'uri', title: 'URL del logo (claro)', description: 'Recomendado: 512×128 px, PNG/SVG', 'x-ui': { widget: 'image' } },
        logoDarkUrl: { type: 'string', format: 'uri', title: 'URL del logo (oscuro)', description: 'Recomendado: 512×128 px, PNG/SVG', 'x-ui': { widget: 'image' } },
        iconUrl: { type: 'string', format: 'uri', title: 'URL del icono', description: 'Recomendado: 512×512 px (app/PWA)', 'x-ui': { widget: 'image' } },
        faviconUrl: { type: 'string', format: 'uri', title: 'URL del favicon', description: 'Recomendado: 32×32 o 192×192 px', 'x-ui': { widget: 'image' } },
      },
    },
    defaults: { logoUrl: '', logoDarkUrl: '', iconUrl: '', faviconUrl: '' },
  });

  registerSettingSection({
    key: 'localization',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Idioma y región',
      properties: {
        defaultLocale: { type: 'string', enum: ['es', 'en', 'pt'], title: 'Idioma por defecto' },
        timezone: {
          type: 'string',
          title: 'Zona horaria',
          default: 'America/Argentina/Buenos_Aires',
          enum: [
            'America/Argentina/Buenos_Aires', 'America/Mexico_City', 'America/Santiago', 'America/Bogota',
            'America/Lima', 'America/Caracas', 'America/Sao_Paulo', 'America/New_York', 'America/Chicago',
            'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Havana',
            'Europe/Madrid', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
            'Europe/Lisbon', 'Europe/Amsterdam', 'Europe/Moscow', 'Europe/Kyiv', 'Europe/Athens',
            'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Casablanca', 'Africa/Nairobi',
            'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Seoul',
            'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Jerusalem',
            'Asia/Taipei', 'Asia/Manila', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth',
            'Pacific/Auckland', 'Pacific/Honolulu', 'UTC',
          ],
        },
        languages: {
          type: 'array',
          title: 'Idiomas habilitados',
          items: { type: 'string', enum: ['es', 'en', 'pt'] },
        },
      },
    },
    defaults: { defaultLocale: 'es', timezone: 'America/Argentina/Buenos_Aires', languages: ['es'] },
  });

  registerSettingSection({
    key: 'maintenance',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Mantenimiento',
      properties: {
        maintenanceMode: { type: 'boolean', title: 'Modo mantenimiento', default: false },
      },
    },
    defaults: { maintenanceMode: false },
  });

  registerSettingSection({
    key: 'appearance',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Apariencia',
      properties: {
        defaultTheme: { type: 'string', enum: ['light', 'dark', 'system'], title: 'Tema por defecto' },
        primaryColor: { type: 'string', title: 'Color primario', 'x-ui': { widget: 'color' } },
        customCss: { type: 'string', title: 'CSS personalizado', 'x-ui': { widget: 'textarea', rows: 12 } },
      },
    },
    defaults: { defaultTheme: 'system', primaryColor: '#4f46e5', customCss: '' },
  });

  registerSettingSection({
    key: 'seo',
    group: 'seo',
    schema: {
      type: 'object',
      title: 'SEO global',
      properties: {
        siteTitle: { type: 'string', title: 'Título por defecto' },
        metaDescription: { type: 'string', title: 'Descripción meta' },
        keywords: { type: 'string', title: 'Palabras clave' },
        ogImageUrl: { type: 'string', format: 'uri', title: 'Imagen Open Graph' },
        canonicalUrl: { type: 'string', format: 'uri', title: 'URL canónica' },
        robots: { type: 'string', enum: ['index,follow', 'noindex,nofollow'], title: 'Directiva robots' },
      },
    },
    defaults: { robots: 'index,follow' },
  });

  registerSettingSection({
    key: 'legal',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Páginas legales',
      properties: {
        termsOfService: { type: 'string', title: 'Términos del Servicio', 'x-ui': { widget: 'textarea', rows: 28 } },
        disclaimer: { type: 'string', title: 'Aviso Legal', 'x-ui': { widget: 'textarea', rows: 28 } },
        privacyPolicy: { type: 'string', title: 'Política de Privacidad', 'x-ui': { widget: 'textarea', rows: 28 } },
        cookiePolicy: { type: 'string', title: 'Política de Cookies', 'x-ui': { widget: 'textarea', rows: 28 } },
      },
    },
    defaults: {
      termsOfService: LEGAL_TERMS_TEMPLATE,
      disclaimer: LEGAL_DISCLAIMER_TEMPLATE,
      privacyPolicy: LEGAL_PRIVACY_TEMPLATE,
      cookiePolicy: LEGAL_COOKIES_TEMPLATE,
    },
  });

  // Datos de la entidad legal para autocompletar los placeholders de las
  // páginas legales ([NOMBRE_EMPRESA], [JURISDICCIÓN], [DOMICILIO], etc.).
  registerSettingSection({
    key: 'legalCompany',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Datos de la empresa (legales)',
      properties: {
        companyName: { type: 'string', title: 'Nombre legal de la empresa', description: 'Si se deja vacío, se usa el nombre del sitio.' },
        jurisdiction: { type: 'string', title: 'Jurisdicción', description: 'Ej.: Argentina, Ciudad Autónoma de Buenos Aires' },
        registration: { type: 'string', title: 'Registro mercantil' },
        taxId: { type: 'string', title: 'Identificación fiscal (CUIT/CIF/…)', 'x-ui': { secret: true } },
        privacyAuthority: { type: 'string', title: 'Autoridad de control', description: 'Ej.: Agencia de Acceso a la Información Pública (AAIP)' },
        address: { type: 'string', title: 'Domicilio legal', 'x-ui': { secret: true } },
      },
    },
    defaults: {},
  });

  // Traducciones (EN/PT) de las páginas legales. Vacío = se sirve el idioma
  // principal (es) como respaldo.
  registerSettingSection({
    key: 'legalTranslations',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Traducciones de páginas legales (EN/PT)',
      properties: {
        termsOfServiceEn: { type: 'string', title: 'Términos del Servicio (EN)', 'x-ui': { widget: 'textarea', rows: 28 } },
        termsOfServicePt: { type: 'string', title: 'Términos del Servicio (PT)', 'x-ui': { widget: 'textarea', rows: 28 } },
        disclaimerEn: { type: 'string', title: 'Aviso Legal (EN)', 'x-ui': { widget: 'textarea', rows: 28 } },
        disclaimerPt: { type: 'string', title: 'Aviso Legal (PT)', 'x-ui': { widget: 'textarea', rows: 28 } },
        privacyPolicyEn: { type: 'string', title: 'Política de Privacidad (EN)', 'x-ui': { widget: 'textarea', rows: 28 } },
        privacyPolicyPt: { type: 'string', title: 'Política de Privacidad (PT)', 'x-ui': { widget: 'textarea', rows: 28 } },
        cookiePolicyEn: { type: 'string', title: 'Política de Cookies (EN)', 'x-ui': { widget: 'textarea', rows: 28 } },
        cookiePolicyPt: { type: 'string', title: 'Política de Cookies (PT)', 'x-ui': { widget: 'textarea', rows: 28 } },
      },
    },
    defaults: {
      termsOfServiceEn: `# Terms and Conditions of Service

**Last updated:** [FECHA]

These Terms and Conditions of Service (hereinafter, the **"Terms"**) govern access to and
use of the **Webs** platform (hereinafter, the **"Platform"**), operated by
**[NOMBRE_EMPRESA]** (hereinafter, the **"Owner"** or **"We"**), with registered address
at [DOMICILIO], registered in [REGISTRO_MERCANTIL], fiscally identified as
[IDENTIFICACION_FISCAL].

By accessing, registering for, or using the Platform, available at **[URL]**, you accept
these Terms in their entirety. If you do not agree with them, you must not use the
Platform.

## 1. Definitions

- **"User" or "Account holder"**: any natural or legal person who creates an account or
  uses the Platform.
- **"Content"**: all information, text, images, data, or other material uploaded or
  generated through the Platform.
- **"Plugins"**: modules or extensions that expand the Platform's functionality, provided
  by the Owner or by third parties.
- **"Service"**: the set of features offered by the Platform, including the creation and
  administration of websites, plugins, content management, and other available features.

## 2. Acceptance and modifications

2.1. Use of the Platform implies full acceptance of these Terms and of the complementary
policies (Privacy Policy, Cookie Policy, and Legal Notice).

2.2. We reserve the right to modify these Terms at any time. Modifications will take
effect upon publication on this page. Continued use of the Platform after publication of
changes implies acceptance of those changes.

## 3. Description of the service

3.1. The Platform is a modular, scalable, multi-tenant web foundation that allows you to
create and manage websites, install **plugins**, and manage content, organizations,
inventory, sales, and other available features.

3.2. We strive to keep the Platform available, but we **do not guarantee** that it will
operate uninterrupted or error-free. The Platform is provided **"as-is"**, without
prejudice to any applicable legal warranties.

## 4. Accounts and security

4.1. To use certain features, you must create an account by providing truthful, complete,
and up-to-date information. You are responsible for maintaining the confidentiality of
your credentials and for all activity that occurs under your account.

4.2. You must notify us immediately of any unauthorized use of your account by writing to
**[EMAIL_CONTACTO]**.

4.3. Only persons with legal capacity to contract may create accounts and use the
Platform. Minors must obtain authorization from their legal representative.

## 5. Acceptable use

When using the Platform, you agree **not** to:

- violate laws, regulations, or third-party rights;
- upload or distribute content that is unlawful, defamatory, fraudulent, discriminatory,
  malicious, or that infringes intellectual property rights;
- attempt to gain unauthorized access to third-party systems, data, or accounts;
- interfere with, or attempt to destabilize, the proper operation of the Platform;
- reverse engineer, decompile, or circumvent the technical protection measures of the
  Platform or its licensing components, except within the limits permitted by applicable
  law;
- use the Platform to send unsolicited mail (spam) or to carry out activities that may
  harm the reputation or infrastructure of the Owner or third parties.

Failure to comply with this section may result in the suspension or cancellation of your
account, without prejudice to any applicable legal action.

## 6. User content and intellectual property

6.1. You are solely responsible for the **Content** you upload or publish. By uploading
content, you represent that you hold the necessary rights to do so.

6.2. You grant us a limited, non-exclusive, and revocable license to store, process, and
display your Content only to the extent necessary to provide the Service.

6.3. The Platform, its code (under the terms of the applicable open-source licenses),
design, trademarks, and distinctive elements are owned by the Owner or their respective
licensors and are protected by intellectual and industrial property laws.

## 7. Plugins and third-party components

7.1. The Platform allows the installation of **plugins** and components developed by the
Owner or by third parties. Such components may be subject to their own terms and
licenses.

7.2. The Owner is not responsible for the content, operation, or legality of third-party
plugins and components, except to the extent established by applicable law.

## 8. Prices, payments, and subscriptions

8.1. Unless otherwise indicated, the Platform may be operated **without a mandatory
payment method**, since its core components are open-source and free of charge (see the
component compliance annex).

8.2. If paid plans, subscriptions, or transaction fees are enabled in the future, their
terms, prices, and refund policy will be published in advance and will require your
express acceptance before taking effect.

## 9. Availability and maintenance

We may temporarily suspend the Service for maintenance, updates, or security incidents.
We will endeavor to provide advance notice when reasonably possible, without this giving
rise to any right to compensation, except where otherwise provided by law.

## 10. Limitation of liability

10.1. To the maximum extent permitted by applicable law, the Owner shall not be liable for
indirect, incidental, or consequential damages, or for loss of profits, arising from the
use of or inability to use the Platform.

10.2. The Owner shall not be liable for: (a) loss of data or content; (b) service
interruptions; (c) acts or omissions of third parties; (d) misuse of the Platform by
Users.

10.3. Nothing in these Terms excludes or limits any liability that cannot be excluded by
law, nor any rights to which consumers are entitled.

## 11. Indemnification

You agree to hold harmless the Owner, its affiliates, directors, and employees against
claims, damages, and costs (including reasonable attorneys' fees) arising from your use of
the Platform, your Content, or your breach of these Terms.

## 12. Suspension and termination

12.1. You may stop using the Platform at any time and request the deletion of your account
by writing to **[EMAIL_CONTACTO]**.

12.2. We may suspend or cancel your account in the event of breach of these Terms, due to
a legal requirement, or for security reasons, notifying you to the extent possible.

## 13. Governing law and jurisdiction

These Terms shall be governed by and construed in accordance with the laws of
**[JURISDICCIÓN]**. Any dispute arising from these Terms shall be submitted to the
competent courts of **[JURISDICCIÓN]**, without prejudice to the venues that consumer
protection law grants to the User.

## 14. Contact

For questions about these Terms, write to us at **[EMAIL_CONTACTO]** or via **[URL]**.

---

*Adaptable template. Replace the placeholders and review with local legal counsel before
publication.*`,
      termsOfServicePt: `# Termos e Condições do Serviço

**Última atualização:** [FECHA]

Estes Termos e Condições do Serviço (doravante, os **«Termos»**) regem o acesso e o uso da
plataforma **Webs** (doravante, a **«Plataforma»**), operada por **[NOMBRE_EMPRESA]**
(doravante, o **«Titular»** ou **«Nós»**), com domicílio em [DOMICILIO], inscrita em
[REGISTRO_MERCANTIL], identificada fiscalmente como [IDENTIFICACION_FISCAL].

Ao acessar, registrar-se ou utilizar a Plataforma, disponível em **[URL]**, você aceita
estes Termos em sua totalidade. Se você não concordar com eles, não deve utilizar a
Plataforma.

## 1. Definições

- **«Usuário» ou «Titular da conta»**: pessoa física ou jurídica que cria uma conta ou
  utiliza a Plataforma.
- **«Conteúdo»**: toda informação, texto, imagem, dado ou outro material carregado ou
  gerado por meio da Plataforma.
- **«Plugins»**: módulos ou extensões que ampliam as funcionalidades da Plataforma,
  fornecidos pelo Titular ou por terceiros.
- **«Serviço»**: o conjunto de funcionalidades oferecidas pela Plataforma, incluindo a
  criação e a administração de sites, plugins, gerenciamento de conteúdo e demais
  prestações disponíveis.

## 2. Aceitação e modificações

2.1. O uso da Plataforma implica a aceitação plena destes Termos e das políticas
complementares (Política de Privacidade, Política de Cookies e Aviso Legal).

2.2. Reservamo-nos o direito de modificar estes Termos a qualquer momento. As
modificações entrarão em vigor ao serem publicadas nesta página. O uso continuado da
Plataforma após a publicação das alterações implica a aceitação das mesmas.

## 3. Descrição do serviço

3.1. A Plataforma é uma base web modular, escalável e multi-tenant que permite criar e
administrar sites, instalar **plugins**, gerenciar conteúdo, organizações, inventário,
vendas e outras funcionalidades disponíveis.

3.2. Envidamos esforços para manter a Plataforma disponível, mas **não garantimos** que
funcione de forma ininterrupta ou livre de erros. A Plataforma é oferecida **«como está»**
(«as-is»), sem prejuízo das garantias legais que forem aplicáveis.

## 4. Contas e segurança

4.1. Para utilizar certas funções, você deve criar uma conta fornecendo informações
verdadeiras, completas e atualizadas. Você é responsável por manter a confidencialidade de
suas credenciais e de toda atividade que ocorra sob sua conta.

4.2. Você deve nos notificar imediatamente sobre qualquer uso não autorizado de sua conta
escrevendo para **[EMAIL_CONTACTO]**.

4.3. Somente poderão criar contas e utilizar a Plataforma pessoas com capacidade legal
para contratar. Menores de idade deverão contar com autorização de seu representante
legal.

## 5. Uso aceitável

Ao utilizar a Plataforma, você se compromete a **não**:

- violar leis, regulamentos ou direitos de terceiros;
- carregar ou distribuir conteúdo ilícito, difamatório, fraudulento, discriminatório,
  malicioso ou que infrinja direitos de propriedade intelectual;
- tentar acessar sem autorização sistemas, dados ou contas de terceiros;
- interferir ou tentar desestabilizar o correto funcionamento da Plataforma;
- realizar engenharia reversa, descompilar ou burlar as medidas técnicas de proteção da
  Plataforma ou de seus componentes de licenciamento, salvo nos limites permitidos pela
  lei aplicável;
- usar a Plataforma para o envio de correio não solicitado (spam) ou para atividades que
  possam prejudicar a reputação ou a infraestrutura do Titular ou de terceiros.

O descumprimento desta seção poderá dar lugar à suspensão ou ao cancelamento de sua conta,
sem prejuízo das ações legais cabíveis.

## 6. Conteúdo do usuário e propriedade intelectual

6.1. Você é o único responsável pelo **Conteúdo** que carregar ou publicar. Ao carregar
conteúdo, você declara possuir os direitos necessários para fazê-lo.

6.2. Você nos concede uma licença limitada, não exclusiva e revogável para armazenar,
processar e exibir seu Conteúdo somente na medida necessária para prestar o Serviço.

6.3. A Plataforma, seu código (nos termos das licenças open-source aplicáveis), design,
marcas e elementos distintivos são propriedade do Titular ou de seus respectivos
licenciantes e estão protegidos pelas leis de propriedade intelectual e industrial.

## 7. Plugins e componentes de terceiros

7.1. A Plataforma permite instalar **plugins** e componentes desenvolvidos pelo Titular
ou por terceiros. Tais componentes podem estar sujeitos a seus próprios termos e
licenças.

7.2. O Titular não se responsabiliza pelo conteúdo, funcionamento ou legalidade de plugins
e componentes de terceiros, salvo nos termos que a normativa aplicável estabelecer.

## 8. Preços, pagamentos e assinaturas

8.1. Salvo indicação em contrário, a Plataforma pode ser operada **sem um modo de
pagamento obrigatório**, pois seus componentes principais são de código aberto e sem
custo (ver o anexo de conformidade de componentes).

8.2. Se no futuro forem habilitados planos pagos, assinaturas ou comissões por
transações, serão publicadas previamente suas condições, preços e política de reembolso, e
exigirão sua aceitação expressa antes de serem aplicadas.

## 9. Disponibilidade e manutenção

Podemos suspender temporariamente o Serviço por manutenção, atualizações ou incidentes de
segurança. Procuraremos avisar com antecedência quando for razoavelmente possível, sem que
isso gere direito a indenização alguma, salvo disposição legal em contrário.

## 10. Limitação de responsabilidade

10.1. Na máxima medida permitida pela lei aplicável, o Titular não será responsável por
danos indiretos, incidentais, consequentes ou por lucros cessantes decorrentes do uso ou
da impossibilidade de uso da Plataforma.

10.2. O Titular não será responsável por: (a) perda de dados ou de conteúdo; (b)
interrupções do serviço; (c) atos ou omissões de terceiros; (d) uso indevido da
Plataforma por parte dos Usuários.

10.3. Nada nestes Termos exclui ou limita a responsabilidade que não possa ser excluída
por lei, nem os direitos que correspondam aos consumidores.

## 11. Indenização

Você aceita manter indene o Titular, seus afiliados, diretores e empregados frente a
reclamações, danos e custos (incluídos honorários razoáveis de advogados) decorrentes de
seu uso da Plataforma, de seu Conteúdo ou de seu descumprimento destes Termos.

## 12. Suspensão e encerramento

12.1. Você pode deixar de usar a Plataforma a qualquer momento e solicitar o encerramento
de sua conta escrevendo para **[EMAIL_CONTACTO]**.

12.2. Podemos suspender ou cancelar sua conta diante de descumprimentos destes Termos, por
exigência legal ou por razões de segurança, notificando-o na medida do possível.

## 13. Lei aplicável e jurisdição

Estes Termos serão regidos e interpretados de acordo com as leis de **[JURISDICCIÓN]**.
Toda controvérsia decorrente destes Termos será submetida aos tribunais competentes de
**[JURISDICCIÓN]**, sem prejuízo dos foros que a normativa de defesa do consumidor
reconhecer ao Usuário.

## 14. Contato

Para consultas sobre estes Termos, escreva-nos para **[EMAIL_CONTACTO]** ou por meio de
**[URL]**.

---

*Modelo adaptável. Substituir os placeholders e revisar com assessor jurídico local antes
de sua publicação.*`,
      disclaimerEn: `# Legal Notice and Disclaimer

**Last updated:** [FECHA]

## 1. Identification of the owner

In compliance with information obligations, you are hereby informed that the **Webs**
platform (hereinafter, the **"Platform"**), accessible at **[URL]**, is operated by:

- **Owner:** [NOMBRE_EMPRESA]
- **Address:** [DOMICILIO]
- **Commercial register:** [REGISTRO_MERCANTIL]
- **Tax identification:** [IDENTIFICACION_FISCAL]
- **Contact email:** [EMAIL_CONTACTO]

## 2. Purpose

This Legal Notice governs access to and use of the Platform and makes available to users
the information required by applicable law. Access to the Platform confers the status of
user and implies acceptance of this Legal Notice, of the
[Terms of Service](/legal/terms), of the
[Privacy Policy](/legal/privacy), and of the
[Cookie Policy](/legal/cookies).

## 3. Intellectual and industrial property

3.1. The Platform, its design, texts, logos, trademarks, structure, and other distinctive
elements are owned by [NOMBRE_EMPRESA] or their respective licensors, except for
components distributed under open-source licenses (see the compliance annex).

3.2. Reproduction, distribution, transformation, or public communication of such elements
is prohibited without prior written authorization, except in cases permitted by law.

## 4. Third-party content and plugins

4.1. The Platform may include or allow the installation of **plugins**, modules, links, or
third-party content. Such content is governed by the terms and licenses of their
respective owners.

4.2. [NOMBRE_EMPRESA] is not responsible for the content, availability, accuracy, or
operation of third-party plugins and services, nor for external links to which the
Platform may refer.

## 5. Disclaimer of liability

5.1. **No warranties.** The Platform is provided **"as-is"** and **"as available"**. To the
maximum extent permitted by law, [NOMBRE_EMPRESA] grants no warranties, express or
implied, of merchantability, fitness for a particular purpose, non-infringement, accuracy,
availability, or absence of errors or viruses.

5.2. **User content.** Content published by users is their sole responsibility.
[NOMBRE_EMPRESA] does not control or guarantee the truthfulness, legality, or suitability
of such content.

5.3. **Availability.** [NOMBRE_EMPRESA] does not guarantee uninterrupted availability of
the Platform. Suspensions may occur due to maintenance, updates, or causes beyond its
control.

5.4. **Decisions based on information.** The information on the Platform does not
constitute professional advice (legal, accounting, financial, or otherwise). Users must
verify any decision with qualified professionals.

5.5. **Security and data.** While reasonable security measures are applied (see the
[Privacy Policy](/legal/privacy)), no transmission over the Internet is entirely secure.
Users are responsible for protecting their credentials and backing up their information.

## 6. Limitation of liability

To the maximum extent permitted by applicable law, [NOMBRE_EMPRESA] shall not be liable
for direct, indirect, incidental, special, or consequential damages, nor for loss of
profits, arising from the use of or inability to use the Platform, including, without
limitation, loss of data, profits, or business opportunities.

The foregoing does not exclude any liability that cannot be limited by law, nor any rights
granted to consumers by applicable law in **[JURISDICCIÓN]**.

## 7. External links

The Platform may contain links to third-party websites. [NOMBRE_EMPRESA] does not exercise
control over such sites and is not responsible for their content or privacy policies.
Access to third-party sites is carried out under the sole responsibility of the user.

## 8. Modifications

[NOMBRE_EMPRESA] reserves the right to modify, suspend, or discontinue, temporarily or
permanently, any part of the Platform, as well as to update this Legal Notice.
Modifications will take effect upon publication on this page.

## 9. Applicable law and jurisdiction

This Legal Notice is governed by the laws of **[JURISDICCIÓN]**. For any dispute arising
therefrom, the parties submit to the competent courts of **[JURISDICCIÓN]**, without
prejudice to the venues that correspond to consumers.

## 10. Contact

For any questions about this Legal Notice, you may contact us at **[EMAIL_CONTACTO]** or
via **[URL]**.

---

*Adaptable template. Replace the placeholders and review with local legal counsel before
publication.*`,
      disclaimerPt: `# Aviso Legal e Isenção de Responsabilidade

**Última atualização:** [FECHA]

## 1. Identificação do titular

Em cumprimento às obrigações de informação, informa-se que a plataforma **Webs**
(doravante, a **«Plataforma»**), acessível em **[URL]**, é operada por:

- **Titular:** [NOMBRE_EMPRESA]
- **Domicílio:** [DOMICILIO]
- **Registro mercantil:** [REGISTRO_MERCANTIL]
- **Identificação fiscal:** [IDENTIFICACION_FISCAL]
- **E-mail de contato:** [EMAIL_CONTACTO]

## 2. Objeto

O presente Aviso Legal regula o acesso e o uso da Plataforma e disponibiliza aos usuários
a informação exigida pela normativa aplicável. O acesso à Plataforma atribui a condição de
usuário e implica a aceitação deste Aviso Legal, dos
[Termos do Serviço](/legal/terms), da
[Política de Privacidade](/legal/privacy) e da
[Política de Cookies](/legal/cookies).

## 3. Propriedade intelectual e industrial

3.1. A Plataforma, seu design, textos, logotipos, marcas, estrutura e demais elementos
distintivos são titularidade de [NOMBRE_EMPRESA] ou de seus respectivos licenciantes, salvo
os componentes distribuídos sob licenças de código aberto (ver o anexo de conformidade).

3.2. É proibida a reprodução, distribuição, transformação ou comunicação pública de tais
elementos sem autorização prévia e por escrito, salvo nos casos legalmente permitidos.

## 4. Conteúdo de terceiros e plugins

4.1. A Plataforma pode incluir ou permitir a instalação de **plugins**, módulos, links ou
conteúdos de terceiros. Tais conteúdos regem-se pelos termos e licenças de seus
respectivos titulares.

4.2. [NOMBRE_EMPRESA] não se responsabiliza pelo conteúdo, disponibilidade, exatidão ou
funcionamento dos plugins e serviços de terceiros, nem pelos links externos aos quais a
Plataforma possa remeter.

## 5. Isenção de responsabilidade

5.1. **Sem garantias.** A Plataforma é fornecida **«como está»** («as-is») e **«conforme a
disponibilidade»** («as available»). Na máxima medida permitida pela lei,
[NOMBRE_EMPRESA] não concede garantias, expressas ou implícitas, de comercialização,
adequação a um fim específico, não infração, exatidão, disponibilidade ou ausência de
erros ou vírus.

5.2. **Conteúdo do usuário.** Os conteúdos publicados pelos usuários são de sua exclusiva
responsabilidade. [NOMBRE_EMPRESA] não controla nem garante a veracidade, legalidade ou
idoneidade de tais conteúdos.

5.3. **Disponibilidade.** [NOMBRE_EMPRESA] não garante a disponibilidade ininterrupta da
Plataforma. Poderão ocorrer suspensões por manutenção, atualizações ou causas alheias ao
seu controle.

5.4. **Decisões baseadas na informação.** A informação da Plataforma não constitui
assessoramento profissional (jurídico, contábil, financeiro ou de outra natureza). O
usuário deve contrastar qualquer decisão com profissionais habilitados.

5.5. **Segurança e dados.** Embora sejam aplicadas medidas de segurança razoáveis (ver a
[Política de Privacidade](/legal/privacy)), nenhuma transmissão pela Internet é totalmente
segura. O usuário é responsável por proteger suas credenciais e por realizar cópias de
segurança de suas informações.

## 6. Limitação de responsabilidade

Na máxima medida permitida pela lei aplicável, [NOMBRE_EMPRESA] não responderá por danos
diretos, indiretos, incidentais, especiais ou consequentes, nem por lucros cessantes,
decorrentes do uso ou da impossibilidade de uso da Plataforma, incluídos, sem limitação, a
perda de dados, de benefícios ou de oportunidades de negócio.

O anterior não exclui a responsabilidade que, por lei, não possa ser limitada, nem os
direitos reconhecidos aos consumidores pela normativa aplicável em **[JURISDICCIÓN]**.

## 7. Links externos

A Plataforma pode conter links para sites de terceiros. [NOMBRE_EMPRESA] não exerce
controle sobre tais sites e não se responsabiliza por seu conteúdo nem por suas políticas
de privacidade. O acesso a sites de terceiros é realizado sob a exclusiva responsabilidade
do usuário.

## 8. Modificações

[NOMBRE_EMPRESA] reserva-se o direito de modificar, suspender ou descontinuar, temporária
ou definitivamente, qualquer parte da Plataforma, bem como de atualizar este Aviso Legal.
As modificações entrarão em vigor ao serem publicadas nesta página.

## 9. Legislação aplicável e jurisdição

Este Aviso Legal rege-se pelas leis de **[JURISDICCIÓN]**. Para qualquer controvérsia
decorrente do mesmo, as partes submetem-se aos tribunais competentes de
**[JURISDICCIÓN]**, sem prejuízo dos foros que correspondam aos consumidores.

## 10. Contato

Para qualquer consulta sobre este Aviso Legal, você pode nos contatar em
**[EMAIL_CONTACTO]** ou por meio de **[URL]**.

---

*Modelo adaptável. Substituir os placeholders e revisar com assessor jurídico local antes
de sua publicação.*`,
      privacyPolicyEn: `# Privacy Policy

**Last updated:** [FECHA]

This Privacy Policy describes how **[NOMBRE_EMPRESA]** (hereinafter, the **"Controller"**
or **"We"**) collects, uses, stores, and protects the personal data of users of the
**Webs** platform (the **"Platform"**), accessible at **[URL]**.

This policy has been drafted considering the **General Data Protection Regulation (GDPR —
Regulation (EU) 2016/679)** and the **Lei Geral de Proteção de Dados (LGPD — Law No.
13,709/2018)**, as well as any local regulations applicable in **[JURISDICCIÓN]**.

## 1. Data controller

- **Controller:** [NOMBRE_EMPRESA]
- **Address:** [DOMICILIO]
- **Contact email (privacy):** [EMAIL_CONTACTO]

## 2. Personal data we collect

Depending on how you use the Platform, we may collect:

| Category | Examples |
| -------- | -------- |
| **Account data** | first name, last name, email address, username, password (stored hashed). |
| **Organization data** | organization name, roles, permissions, contact data. |
| **Usage data** | IP address, browser type, operating system, pages visited, date and time of access. |
| **Billing data** (only if payments are enabled) | data required to invoice and manage subscriptions. |
| **User content** | texts, images, and other content you upload to the Platform. |
| **Technical authentication data** | WebAuthn/passkey credentials, OTP codes, to the extent you use multi-factor authentication. |

## 3. Purposes and legal bases of processing

We process personal data for the following purposes:

| Purpose | Legal basis (GDPR) | Legal basis (LGPD) |
| ------- | ------------------ | ------------------ |
| Provide the service and manage accounts | Performance of a contract (Art. 6.1.b) | Performance of a contract (Art. 7.V) |
| Ensure security and prevent fraud | Legitimate interest (Art. 6.1.f) | Credit protection / legitimate interest (Art. 7.IX / 7.X) |
| Comply with legal obligations | Legal obligation (Art. 6.1.c) | Legal obligation (Art. 7.II) |
| Send operational service communications | Performance of a contract / legitimate interest | Performance of a contract / legitimate interest |
| Marketing (only with consent) | Consent (Art. 6.1.a) | Consent (Art. 7.I) |

## 4. Cookies and similar technologies

We use session and preference cookies. For more detail, please see our
[Cookie Policy](/legal/cookies).

## 5. Recipients and international transfers

5.1. We may share data with **service providers** that act as processors (for example,
cloud infrastructure, email services, analytics), only to the extent necessary to provide
the service and under the contractual safeguards required by applicable law.

5.2. The Platform is designed to be **multi-tenant** and to be deployed on our own or
third-party infrastructure. If data is transferred to countries outside the jurisdiction
of origin, we will apply appropriate safeguards (standard contractual clauses, adequacy
decisions, or others permitted by law).

5.3. We do not sell personal data.

## 6. Retention periods

We retain personal data only for as long as necessary to fulfill the purposes described
and, subsequently, for the periods required by applicable law (for example, tax or
accounting obligations). Session and preference data is retained as described in the
[Cookie Policy](/legal/cookies).

## 7. Data subjects' rights

To the extent permitted by applicable law, you may exercise the following rights by
writing to **[EMAIL_CONTACTO]**:

- **Access**: know what data we process and obtain a copy.
- **Rectification**: correct inaccurate or incomplete data.
- **Erasure** ("right to be forgotten"): request the deletion of your data.
- **Objection**: object to certain processing (for example, marketing).
- **Restriction**: request the restriction of processing in certain cases.
- **Portability**: receive your data in a structured, commonly used format.
- **Withdrawal of consent**: revoke the consent granted at any time.
- **Not to be subject to automated decisions** with significant legal effects, in the
  terms of the law.

We will respond to requests within the periods provided by applicable law (in general,
within the GDPR/LGPD timeframes). If you consider that the processing does not comply with
the law, you may lodge a complaint with the competent supervisory authority:
[AUTORIDAD_CONTROL].

## 8. Security

We apply reasonable technical and organizational measures to protect personal data,
including: encryption in transit (HTTPS/TLS), hashed password storage (\`bcrypt\`), session
cookies with \`HttpOnly\`/\`Secure\`/\`SameSite\`, role-based access control (RBAC), and
authentication rate limiting. See also \`docs/guides/seguridad.md\`.

## 9. Minors

The Platform is not directed at minors without the supervision of a responsible adult. We
do not knowingly collect data from minors without the consent of their legal
representatives. If you become aware that a minor has provided us with data, contact us at
**[EMAIL_CONTACTO]** to proceed with its deletion.

## 10. Changes to this policy

We may update this Privacy Policy to reflect legal or service changes. Modifications will
be published on this page, indicating the date of last update. Substantial changes will be
communicated through the available means.

## 11. Contact

For any questions about this Privacy Policy or to exercise your rights, write to us at
**[EMAIL_CONTACTO]** or via **[URL]**.

---

*Adaptable template. Replace the placeholders and review with local legal counsel
(DGPDP/DPO) before publication.*`,
      privacyPolicyPt: `# Política de Privacidade

**Última atualização:** [FECHA]

Esta Política de Privacidade descreve como **[NOMBRE_EMPRESA]** (doravante, o
**«Responsável»** ou **«Nós»**) coleta, utiliza, armazena e protege os dados pessoais dos
usuários da plataforma **Webs** (a **«Plataforma»**), acessível em **[URL]**.

Esta política foi redigida considerando o **Regulamento Geral de Proteção de Dados (GDPR —
Regulamento (UE) 2016/679)** e a **Lei Geral de Proteção de Dados (LGPD — Lei nº
13.709/2018)**, bem como a normativa local aplicável em **[JURISDICCIÓN]**.

## 1. Responsável pelo tratamento

- **Responsável:** [NOMBRE_EMPRESA]
- **Domicílio:** [DOMICILIO]
- **E-mail de contato (privacidade):** [EMAIL_CONTACTO]

## 2. Dados pessoais que coletamos

Conforme você utiliza a Plataforma, podemos coletar:

| Categoria | Exemplos |
| --------- | -------- |
| **Dados da conta** | nome, sobrenome, e-mail, nome de usuário, senha (armazenada com hash). |
| **Dados da organização** | nome da organização, papéis, permissões, dados de contato. |
| **Dados de uso** | endereço IP, tipo de navegador, sistema operacional, páginas visitadas, data e hora de acesso. |
| **Dados de faturamento** (somente se pagamentos forem habilitados) | dados necessários para faturar e gerenciar assinaturas. |
| **Conteúdo do usuário** | textos, imagens e demais conteúdos que você carregar na Plataforma. |
| **Dados técnicos de autenticação** | credenciais WebAuthn/passkeys, códigos OTP, na medida em que você utiliza autenticação multifator. |

## 3. Finalidades e bases legais do tratamento

Tratamos os dados pessoais para as seguintes finalidades:

| Finalidade | Base legal (GDPR) | Base legal (LGPD) |
| ---------- | ----------------- | ----------------- |
| Prestar o serviço e gerenciar contas | Execução de contrato (Art. 6.1.b) | Execução de contrato (Art. 7.V) |
| Garantir a segurança e prevenir fraudes | Interesse legítimo (Art. 6.1.f) | Proteção do crédito / interesse legítimo (Art. 7.IX / 7.X) |
| Cumprir obrigações legais | Obrigação legal (Art. 6.1.c) | Obrigação legal (Art. 7.II) |
| Enviar comunicações operacionais do serviço | Execução de contrato / interesse legítimo | Execução de contrato / interesse legítimo |
| Marketing (somente com consentimento) | Consentimento (Art. 6.1.a) | Consentimento (Art. 7.I) |

## 4. Cookies e tecnologias similares

Utilizamos cookies de sessão e de preferências. Para mais detalhes, consulte nossa
[Política de Cookies](/legal/cookies).

## 5. Destinatários e transferências internacionais

5.1. Podemos compartilhar dados com **provedores de serviços** que atuam como operadores
de tratamento (por exemplo, infraestrutura em nuvem, serviços de e-mail, análises),
somente na medida necessária para prestar o serviço e sob as garantias contratuais
exigidas pela normativa aplicável.

5.2. A Plataforma foi projetada para ser **multi-tenant** e para ser implantada em
infraestrutura própria ou de terceiros. Se os dados forem transferidos para países fora da
jurisdição de origem, aplicaremos as salvaguardas adequadas (cláusulas contratuais
padrão, decisões de adequação ou outras permitidas pela lei).

5.3. Não vendemos dados pessoais.

## 6. Prazos de conservação

Conservamos os dados pessoais somente durante o tempo necessário para cumprir as
finalidades descritas e, posteriormente, durante os prazos exigidos pela normativa
aplicável (por exemplo, obrigações fiscais ou contábeis). Os dados de sessão e
preferências são conservados conforme indicado na [Política de Cookies](/legal/cookies).

## 7. Direitos dos titulares dos dados

Na medida em que a normativa aplicável permita, você pode exercer os seguintes direitos
escrevendo para **[EMAIL_CONTACTO]**:

- **Acesso**: conhecer quais dados tratamos e obter uma cópia.
- **Retificação**: corrigir dados inexatos ou incompletos.
- **Eliminação** («direito ao esquecimento»): solicitar a eliminação de seus dados.
- **Oposição**: opor-se a certos tratamentos (por exemplo, marketing).
- **Limitação**: solicitar a restrição do tratamento em certos casos.
- **Portabilidade**: receber seus dados em formato estruturado e de uso comum.
- **Retirada do consentimento**: revogar o consentimento concedido a qualquer momento.
- **Não ser objeto de decisões automatizadas** com efeitos jurídicos significativos, nos
  termos da lei.

Responderemos às solicitações nos prazos previstos pela normativa aplicável (em geral,
dentro dos prazos do GDPR/LGPD). Se você considerar que o tratamento não se ajusta à
normativa, pode apresentar uma reclamação à autoridade de controle competente:
[AUTORIDAD_CONTROL].

## 8. Segurança

Aplicamos medidas técnicas e organizacionais razoáveis para proteger os dados pessoais,
incluindo: criptografia em trânsito (HTTPS/TLS), armazenamento de senhas com hash
(\`bcrypt\`), cookies de sessão com \`HttpOnly\`/\`Secure\`/\`SameSite\`, controle de acesso
baseado em papéis (RBAC) e limitação de tentativas de autenticação. Ver também
\`docs/guides/seguridad.md\`.

## 9. Menores de idade

A Plataforma não é destinada a menores de idade sem a supervisão de um adulto responsável.
Não coletamos deliberadamente dados de menores sem o consentimento de seus representantes
legais. Se você tiver conhecimento de que um menor nos forneceu dados, contate-nos em
**[EMAIL_CONTACTO]** para proceder à sua eliminação.

## 10. Modificações desta política

Podemos atualizar esta Política de Privacidade para refletir mudanças legais ou do
serviço. As modificações serão publicadas nesta página, indicando a data da última
atualização. As mudanças substanciais serão comunicadas pelos meios disponíveis.

## 11. Contato

Para qualquer consulta sobre esta Política de Privacidade ou para exercer seus direitos,
escreva-nos para **[EMAIL_CONTACTO]** ou por meio de **[URL]**.

---

*Modelo adaptável. Substituir os placeholders e revisar com assessor jurídico local
(DGPDP/DPO) antes de sua publicação.*`,
      cookiePolicyEn: `# Cookie Policy

**Last updated:** [FECHA]

This Cookie Policy explains what cookies are, which ones are used by the **Webs** platform
(the **"Platform"**), accessible at **[URL]**, and how you can manage them.

## 1. What are cookies?

Cookies are small text files stored on your device when you visit a website. They serve to
remember preferences, keep sessions active, and, in some cases, collect information about
the use of the site.

## 2. Cookies used by the Platform

The Platform uses only **technical and preference** cookies, necessary for its operation
or to remember your choices. It does not use advertising or third-party tracking cookies.

### 2.1. Session cookie (necessary)

| Cookie | Type | Purpose | Attributes |
| ------ | ---- | ------- | ---------- |
| Refresh token (opaque) | Session | Keep the session securely signed in. | \`HttpOnly\` · \`Secure\` · \`SameSite=Lax\` · \`path=/\` |

- The value is **opaque** (not readable by JavaScript) and its hash is stored in the
  database.
- The session renews on a sliding basis: **30 days** by default, **90 days** with the
  "Remember me" option.
- It is deleted upon logout.

### 2.2. Preference cookies (non-essential)

| Cookie | Value | Purpose | Expiration |
| ------ | ----- | ------- | ---------- |
| \`webs-theme\` | \`light\` / \`dark\` / \`system\` | Remember the chosen interface theme. | 1 year |
| \`webs-locale\` | \`es\` / \`en\` / \`pt\` | Remember the chosen language. | 1 year |

- Attributes: \`SameSite=Lax\` · \`Secure\` (on HTTPS) · \`path=/\`.
- They do not contain sensitive personal data.

## 3. Third-party cookies

In its base configuration, the Platform **does not install third-party cookies**
(advertising, analytics, or social networks). If third-party services are integrated in
the future (for example, analytics or payment gateways), this policy will be updated and,
where required, your prior consent will be requested.

## 4. Consent

4.1. **Necessary** cookies (session) are installed because they are essential for the
operation of the Platform.

4.2. **Preference** cookies are installed to remember your choices. In jurisdictions that
require it (for example, the European Union under the ePrivacy Directive/GDPR), your
consent will be requested before installing non-essential cookies, and you may withdraw it
at any time.

## 5. How to manage or disable cookies

You can configure your browser to block, delete, or notify you before accepting cookies:

- **Chrome / Edge**: Settings → Privacy and security → Cookies.
- **Firefox**: Options → Privacy & Security → Cookies and Site Data.
- **Safari**: Preferences → Privacy → Cookies.

Keep in mind that disabling necessary cookies may prevent you from logging in or using the
Platform correctly.

## 6. Updates to this policy

We may update this Cookie Policy to reflect changes in the use of cookies or in applicable
law. Modifications will be published on this page, indicating the date of last update.

## 7. Contact

For questions about this Cookie Policy, write to us at **[EMAIL_CONTACTO]** or via
**[URL]**.

---

*Adaptable template. Replace the placeholders and review with local legal counsel before
publication. Technical implementation detail in \`docs/guides/cookies.md\`.*`,
      cookiePolicyPt: `# Política de Cookies

**Última atualização:** [FECHA]

Esta Política de Cookies explica o que são cookies, quais são utilizados pela plataforma
**Webs** (a **«Plataforma»**), acessível em **[URL]**, e como você pode gerenciá-los.

## 1. O que são cookies?

Cookies são pequenos arquivos de texto armazenados em seu dispositivo quando você visita
um site. Servem para lembrar preferências, manter sessões ativas e, em alguns casos,
coletar informações sobre o uso do site.

## 2. Cookies que a Plataforma utiliza

A Plataforma utiliza somente cookies **técnicos e de preferências**, necessários para seu
funcionamento ou para lembrar suas escolhas. Não utiliza cookies de publicidade nem de
rastreamento de terceiros.

### 2.1. Cookie de sessão (necessário)

| Cookie | Tipo | Finalidade | Atributos |
| ------ | ---- | ---------- | --------- |
| Refresh token (opaco) | Sessão | Manter a sessão iniciada de forma segura. | \`HttpOnly\` · \`Secure\` · \`SameSite=Lax\` · \`path=/\` |

- O valor é **opaco** (não legível por JavaScript) e seu hash é armazenado no banco de
  dados.
- A sessão se renova de forma deslizante: **30 dias** por padrão, **90 dias** com a opção
  «Lembrar-me».
- É eliminada ao encerrar a sessão.

### 2.2. Cookies de preferências (não essenciais)

| Cookie | Valor | Finalidade | Expiração |
| ------ | ----- | ---------- | --------- |
| \`webs-theme\` | \`light\` / \`dark\` / \`system\` | Lembrar o tema de interface escolhido. | 1 ano |
| \`webs-locale\` | \`es\` / \`en\` / \`pt\` | Lembrar o idioma escolhido. | 1 ano |

- Atributos: \`SameSite=Lax\` · \`Secure\` (em HTTPS) · \`path=/\`.
- Não contêm dados pessoais sensíveis.

## 3. Cookies de terceiros

Em sua configuração base, a Plataforma **não instala cookies de terceiros** (publicidade,
análise ou redes sociais). Se no futuro forem integrados serviços de terceiros (por
exemplo, análise ou gateways de pagamento), esta política será atualizada e, quando
exigível, será solicitado seu consentimento prévio.

## 4. Consentimento

4.1. Os cookies **necessários** (sessão) são instalados por serem imprescindíveis para o
funcionamento da Plataforma.

4.2. Os cookies de **preferências** são instalados para lembrar suas escolhas. Nas
jurisdições que o exigem (por exemplo, a União Europeia conforme a Diretiva
ePrivacy/GDPR), será solicitado seu consentimento antes de instalar cookies não
essenciais, e você poderá retirá-lo a qualquer momento.

## 5. Como gerenciar ou desabilitar os cookies

Você pode configurar seu navegador para bloquear, eliminar ou ser avisado antes de aceitar
cookies:

- **Chrome / Edge**: Configurações → Privacidade e segurança → Cookies.
- **Firefox**: Opções → Privacidade e segurança → Cookies e dados do site.
- **Safari**: Preferências → Privacidade → Cookies.

Tenha em conta que desabilitar os cookies necessários pode impedir iniciar sessão ou
utilizar corretamente a Plataforma.

## 6. Atualizações desta política

Podemos atualizar esta Política de Cookies para refletir mudanças no uso de cookies ou na
normativa aplicável. As modificações serão publicadas nesta página, indicando a data da
última atualização.

## 7. Contato

Para consultas sobre esta Política de Cookies, escreva-nos para **[EMAIL_CONTACTO]** ou por
meio de **[URL]**.

---

*Modelo adaptável. Substituir os placeholders e revisar com assessor jurídico local antes
de sua publicação. Detalhe técnico de implementação em \`docs/guides/cookies.md\`.*`,
    },
  });

  registerSettingSection({
    key: 'contact',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Contacto',
      properties: {
        email: { type: 'string', format: 'email', title: 'Correo de contacto' },
        phone: { type: 'string', title: 'Teléfono', 'x-ui': { secret: true } },
        address: { type: 'string', title: 'Dirección', 'x-ui': { secret: true } },
        whatsapp: { type: 'string', title: 'WhatsApp', 'x-ui': { secret: true } },
      },
    },
    defaults: {},
  });

  registerSettingSection({
    key: 'social',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Redes sociales',
      properties: {
        facebook: { type: 'string', format: 'uri' },
        instagram: { type: 'string', format: 'uri' },
        x: { type: 'string', format: 'uri' },
        linkedin: { type: 'string', format: 'uri' },
        youtube: { type: 'string', format: 'uri' },
      },
    },
    defaults: {},
  });

  registerSettingSection({
    key: 'smtp',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Correo (SMTP)',
      properties: {
        enabled: { type: 'boolean', title: 'Habilitar envío de correos' },
        host: { type: 'string', title: 'Servidor SMTP' },
        port: { type: 'integer', title: 'Puerto', default: 587 },
        user: { type: 'string', title: 'Usuario' },
        password: { type: 'string', title: 'Contraseña', 'x-ui': { widget: 'password', secret: true } },
        from: { type: 'string', title: 'Remitente (from)' },
        secure: { type: 'boolean', title: 'Usar SSL/TLS (secure)' },
      },
    },
    defaults: { enabled: false, port: 587 },
  });

  registerSettingSection({
    key: 'security',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Seguridad',
      properties: {
        hsts: { type: 'boolean', title: 'HSTS (HTTP Strict Transport Security)' },
        hstsMaxAge: { type: 'integer', title: 'HSTS max-age (segundos)', default: 15552000 },
        secureCookies: { type: 'boolean', title: 'Cookies solo por HTTPS' },
        require2FAForAdmin: {
          type: 'boolean',
          title: 'Exigir 2FA/passkey a administradores',
          description: 'Los roles super_admin y admin deben activar 2FA o una passkey para iniciar sesión.',
        },
        contentSecurityPolicy: {
          type: 'string',
          title: 'Content-Security-Policy (vacío = desactivado)',
          'x-ui': { widget: 'textarea', rows: 4 },
        },
      },
    },
    defaults: { hsts: true, hstsMaxAge: 15552000, require2FAForAdmin: false, contentSecurityPolicy: '' },
  });

  registerSettingSection({
    key: 'footer',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Footer',
      properties: {
        copyrightYear: { type: 'integer', title: 'Año de creación' },
        copyrightMode: { type: 'string', enum: ['current', 'range'], title: 'Modo de copyright', default: 'range' },
        contactEmail: { type: 'string', format: 'email', title: 'Email de contacto' },
        contactPhone: { type: 'string', title: 'Teléfono de contacto' },
        contactAddress: { type: 'string', title: 'Dirección' },
        legalLinks: {
          type: 'array',
          title: 'Enlaces legales',
          items: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string', format: 'uri' } } },
        },
      },
    },
    defaults: { copyrightMode: 'range' },
  });

  // Campos personalizados del perfil de usuario (los define el administrador;
  // el usuario los completa en /account). Cada campo: key, label, type, required.
  registerSettingSection({
    key: 'userProfile',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Campos del perfil de usuario',
      properties: {
        fields: {
          type: 'array',
          title: 'Campos personalizados',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', title: 'Clave (id)' },
              label: { type: 'string', title: 'Etiqueta' },
              type: { type: 'string', enum: ['text', 'date', 'number', 'select'], title: 'Tipo', default: 'text' },
              options: { type: 'string', title: 'Opciones (separadas por coma, si es select)' },
              required: { type: 'boolean', title: 'Obligatorio' },
            },
          },
        },
      },
    },
    defaults: { fields: [] },
  });

  // Pagos: umbral de auto-cancelación de transacciones pendientes.
  registerSettingSection({
    key: 'payments',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Pagos',
      properties: {
        pendingExpiryMinutes: {
          type: 'integer',
          title: 'Minutos para cancelar pagos pendientes',
          description: 'Los pagos pendientes más antiguos que este umbral se eliminan automáticamente.',
          minimum: 1,
          default: 60,
        },
        requireWebhookSignature: {
          type: 'boolean',
          title: 'Exigir verificación de firma en los webhooks',
          description: 'Si está activado, cada webhook de pago debe traer una firma válida. Si lo desactivás, se aceptará sin validar la firma (solo se valida el proveedor y la idempotencia).',
          default: true,
          'x-ui': {
            help: {
              text: 'Recomendado mantener activado. Desactivá solo si tu pasarela no envía firma y querés aceptar los webhooks igual (menos seguro, quedás expuesto a notificaciones falsas).',
              url: 'https://stripe.com/docs/webhooks/signatures',
            },
          },
        },
      },
    },
    defaults: { pendingExpiryMinutes: 60, requireWebhookSignature: true },
  });

  // Inventario: controla si el stock de productos y de inventario es el mismo.
  registerSettingSection({
    key: 'inventory',
    group: 'general',
    schema: {
      type: 'object',
      title: 'Inventario',
      properties: {
        unifiedWithCommerce: {
          type: 'boolean',
          title: 'Unificar inventario y tienda',
          description:
            'Si está activado, el stock de productos y de inventario es el MISMO: el POS (Ventas) y la tienda descuentan ambos. Si lo desactivás, cada uno mantiene su stock por separado.',
          default: true,
        },
      },
    },
    defaults: { unifiedWithCommerce: true },
  });
}
