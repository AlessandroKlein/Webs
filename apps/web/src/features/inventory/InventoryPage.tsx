import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, downloadFile } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { Tabs } from '../../components/ui/Tabs';
import { Badge } from '../../components/ui/Badge';

const INV = '/api/v1/inventory';

// ── Tipos (contrato del backend M9, ADR-0023) ───────────────────────────────
interface Variant {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  name: string;
  attributes: Record<string, unknown>;
  active: boolean;
}

interface Product {
  id: string;
  title: string;
  description: string | null;
  price: number; // centavos
  stock: number;
  categoryId: string | null;
  brandId: string | null;
  supplierId: string | null;
  variants: Variant[];
}

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  active: boolean;
}

interface Brand {
  id: string;
  name: string;
  active: boolean;
}

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
}

interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isDefault: boolean;
  active: boolean;
}

interface StockLevel {
  id: string;
  warehouseId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  averageCost: number;
  product: { id: string; title: string };
  variant: { id: string; name: string; sku: string } | null;
  warehouse: { id: string; name: string; code: string };
}

interface StockAlert {
  id: string;
  productId: string;
  variantId: string | null;
  warehouseId: string;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  level: 'critico' | 'bajo';
}

interface StockMovement {
  id: string;
  warehouseId: string;
  productId: string;
  variantId: string | null;
  type: 'entrada' | 'salida' | 'ajuste' | 'transferencia';
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string | null;
  userId: string;
  referenceType: string | null;
  referenceId: string | null;
  unitCost: number | null;
  createdAt: string;
}

interface ValuationReport {
  lines: Array<{
    productId: string;
    title: string;
    warehouseId: string;
    quantity: number;
    averageCost: number;
    value: number;
  }>;
  totalValue: number;
  totalQuantity: number;
}

type Tab = 'products' | 'stock' | 'movements' | 'alerts' | 'reports' | 'catalog';

const fmtMoney = (cents: number): string => (cents / 100).toFixed(2);

const LEVEL_TONE = { critico: 'danger', bajo: 'warning' } as const;
const MOVE_TONE: Record<StockMovement['type'], 'success' | 'danger' | 'info' | 'warning'> = {
  entrada: 'success',
  salida: 'danger',
  ajuste: 'info',
  transferencia: 'warning',
};

// El backend devuelve `level` en español ('critico' | 'bajo'); las claves i18n
// usan el nombre canónico ('critical' | 'low'), así que mapeamos al renderizar.
const LEVEL_KEY: Record<StockAlert['level'], string> = {
  critico: 'admin.inventory.critical',
  bajo: 'admin.inventory.low',
};

const toInt = (v: string): number => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};

// ── Producto (crear / editar) ───────────────────────────────────────────────
function ProductFormDialog(props: {
  open: boolean;
  editing: Product | null;
  categories: Category[];
  brands: Brand[];
  suppliers: Supplier[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(props.editing?.title ?? '');
  const [description, setDescription] = useState(props.editing?.description ?? '');
  const [price, setPrice] = useState(props.editing ? String(props.editing.price / 100) : '');
  const [categoryId, setCategoryId] = useState(props.editing?.categoryId ?? '');
  const [brandId, setBrandId] = useState(props.editing?.brandId ?? '');
  const [supplierId, setSupplierId] = useState(props.editing?.supplierId ?? '');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [stock, setStock] = useState('0');
  const [minQuantity, setMinQuantity] = useState('0');
  const [criticalQuantity, setCriticalQuantity] = useState('0');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const priceCents = Math.round(parseFloat(price || '0') * 100);
    const body: Record<string, unknown> = props.editing
      ? {
          title: title.trim(),
          description: description.trim() || null,
          price: priceCents,
          categoryId: categoryId || null,
          brandId: brandId || null,
          supplierId: supplierId || null,
        }
      : {
          title: title.trim(),
          description: description.trim() || null,
          price: priceCents,
          categoryId: categoryId || null,
          brandId: brandId || null,
          supplierId: supplierId || null,
          sku: sku.trim() || undefined,
          barcode: barcode.trim() || undefined,
          stock: toInt(stock),
          minQuantity: toInt(minQuantity),
          criticalQuantity: toInt(criticalQuantity),
        };
    props.onSave(body);
  };

  const opts = (list: Array<{ id: string; name: string }>) =>
    list.map((o) => (
      <option key={o.id} value={o.id}>
        {o.name}
      </option>
    ));

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.editing ? t('admin.inventory.editProduct') : t('admin.inventory.newProduct')}
    >
      <form id="inventory-product-form" className="stack" onSubmit={submit}>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField label={t('common.name')} value={title} onChange={(e) => setTitle(e.target.value)} required />
          <TextField
            label={t('admin.inventory.price')}
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            hint={t('admin.inventory.priceHint')}
          />
        </div>
        <TextField
          label={t('admin.inventory.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 180, flex: 1 }}>
            <label>{t('admin.inventory.category')}</label>
            <select className="input form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {opts(props.categories)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 180, flex: 1 }}>
            <label>{t('admin.inventory.brand')}</label>
            <select className="input form-select" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">—</option>
              {opts(props.brands)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 180, flex: 1 }}>
            <label>{t('admin.inventory.supplier')}</label>
            <select className="input form-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">—</option>
              {opts(props.suppliers)}
            </select>
          </div>
        </div>

        {!props.editing && (
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextField label={t('admin.inventory.sku')} value={sku} onChange={(e) => setSku(e.target.value)} />
            <TextField label={t('admin.inventory.barcode')} value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="7790000000000" />
            <TextField label={t('admin.inventory.quantity')} type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} />
            <TextField label={t('admin.inventory.minQuantity')} type="number" min="0" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} />
            <TextField label={t('admin.inventory.criticalQuantity')} type="number" min="0" value={criticalQuantity} onChange={(e) => setCriticalQuantity(e.target.value)} />
          </div>
        )}

        {props.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{props.error}</p>}
        <div className="row">
          <Button type="submit" disabled={props.saving || !title.trim()}>
            {props.saving ? t('common.saving') : props.editing ? t('common.save') : t('common.create')}
          </Button>
          <Button variant="ghost" type="button" onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Variante (crear / editar) ───────────────────────────────────────────────
function VariantFormDialog(props: {
  open: boolean;
  product: Product | null;
  editing: Variant | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(props.editing?.name ?? '');
  const [sku, setSku] = useState(props.editing?.sku ?? '');
  const [barcode, setBarcode] = useState(props.editing?.barcode ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onSave({
      name: name.trim() || undefined,
      sku: sku.trim(),
      barcode: barcode.trim() || null,
    });
  };

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.editing ? t('admin.inventory.editVariant') : t('admin.inventory.addVariant')}
    >
      <form className="stack" onSubmit={submit}>
        <TextField label={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label={t('admin.inventory.sku')} value={sku} onChange={(e) => setSku(e.target.value)} required />
        <TextField label={t('admin.inventory.barcode')} value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="7790000000000" />
        {props.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{props.error}</p>}
        <div className="row">
          <Button type="submit" disabled={props.saving || !sku.trim()}>
            {props.saving ? t('common.saving') : props.editing ? t('common.save') : t('common.create')}
          </Button>
          <Button variant="ghost" type="button" onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Catálogo genérico (categoría / marca / proveedor) ───────────────────────
function CatalogFormDialog(props: {
  open: boolean;
  kind: 'category' | 'brand' | 'supplier';
  editing: Category | Brand | Supplier | null;
  categories: Category[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState((props.editing as { name?: string } | null)?.name ?? '');
  const [parentId, setParentId] = useState((props.editing as Category | null)?.parentId ?? '');
  const [contactName, setContactName] = useState((props.editing as Supplier | null)?.contactName ?? '');
  const [email, setEmail] = useState((props.editing as Supplier | null)?.email ?? '');
  const [phone, setPhone] = useState((props.editing as Supplier | null)?.phone ?? '');

  const titleKey =
    props.kind === 'category' ? 'newCategory' : props.kind === 'brand' ? 'newBrand' : 'newSupplier';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { name: name.trim() };
    if (props.kind === 'category') body.parentId = parentId || null;
    if (props.kind === 'supplier') {
      body.contactName = contactName.trim() || null;
      body.email = email.trim() || null;
      body.phone = phone.trim() || null;
    }
    props.onSave(body);
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} title={t(`admin.inventory.${titleKey}`)}>
      <form className="stack" onSubmit={submit}>
        <TextField label={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} required />
        {props.kind === 'category' && (
          <div className="field">
            <label>{t('admin.inventory.parent')}</label>
            <select className="input form-select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">—</option>
              {props.categories
                .filter((c) => c.id !== (props.editing as Category | null)?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        )}
        {props.kind === 'supplier' && (
          <>
            <TextField label={t('admin.inventory.contactName')} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            <TextField label={t('admin.inventory.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label={t('admin.inventory.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </>
        )}
        {props.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{props.error}</p>}
        <div className="row">
          <Button type="submit" disabled={props.saving || !name.trim()}>
            {props.saving ? t('common.saving') : t('common.create')}
          </Button>
          <Button variant="ghost" type="button" onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Almacén (crear / editar) ────────────────────────────────────────────────
function WarehouseFormDialog(props: {
  open: boolean;
  editing: Warehouse | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(props.editing?.name ?? '');
  const [code, setCode] = useState(props.editing?.code ?? '');
  const [address, setAddress] = useState(props.editing?.address ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onSave({
      name: name.trim(),
      code: code.trim(),
      address: address.trim() || null,
    });
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} title={t('admin.inventory.newWarehouse')}>
      <form className="stack" onSubmit={submit}>
        <TextField label={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField label={t('admin.inventory.code')} value={code} onChange={(e) => setCode(e.target.value)} required />
        <TextField label={t('admin.inventory.address')} value={address} onChange={(e) => setAddress(e.target.value)} />
        {props.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{props.error}</p>}
        <div className="row">
          <Button type="submit" disabled={props.saving || !name.trim() || !code.trim()}>
            {props.saving ? t('common.saving') : t('common.create')}
          </Button>
          <Button variant="ghost" type="button" onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Movimiento de stock (entrada/salida/ajuste/transferencia) ───────────────
function MovementFormDialog(props: {
  open: boolean;
  products: Product[];
  warehouses: Warehouse[];
  stockLevels: StockLevel[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (type: 'entrada' | 'salida' | 'ajuste' | 'transferencia', body: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<StockMovement['type']>('entrada');
  const [warehouseId, setWarehouseId] = useState('');
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const [fifo, setFifo] = useState(false);

  const product = props.products.find((p) => p.id === productId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { productId, variantId: variantId || null };
    if (type === 'transferencia') {
      body.fromWarehouseId = fromWarehouseId;
      body.toWarehouseId = toWarehouseId;
      body.quantity = toInt(quantity);
      if (reason.trim()) body.reason = reason.trim();
    } else {
      body.warehouseId = warehouseId;
      body.quantity = toInt(quantity);
      if (type === 'entrada') {
        body.unitCost = unitCost ? Math.round(parseFloat(unitCost) * 100) : undefined;
        body.fifo = fifo;
      }
      if (reason.trim()) body.reason = reason.trim();
      else if (type === 'ajuste') body.reason = reason.trim() || t('admin.inventory.manualAdjust');
    }
    props.onSave(type, body);
  };

  const warehouseOpts = (list: Warehouse[]) =>
    list.map((w) => (
      <option key={w.id} value={w.id}>
        {w.name} ({w.code})
      </option>
    ));

  const variantOpts = (product?.variants ?? []).map((v) => (
    <option key={v.id} value={v.id}>
      {v.sku}
    </option>
  ));

  return (
    <Dialog open={props.open} onClose={props.onClose} title={t('admin.inventory.newMovement')}>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label>{t('admin.inventory.movementType')}</label>
          <select className="input form-select" value={type} onChange={(e) => setType(e.target.value as StockMovement['type'])}>
            <option value="entrada">{t('admin.inventory.movements.entrada')}</option>
            <option value="salida">{t('admin.inventory.movements.salida')}</option>
            <option value="ajuste">{t('admin.inventory.movements.ajuste')}</option>
            <option value="transferencia">{t('admin.inventory.movements.transferencia')}</option>
          </select>
        </div>

        {type === 'transferencia' ? (
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ minWidth: 180, flex: 1 }}>
              <label>{t('admin.inventory.fromWarehouse')}</label>
              <select className="input form-select" value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)} required>
                <option value="">—</option>
                {warehouseOpts(props.warehouses)}
              </select>
            </div>
            <div className="field" style={{ minWidth: 180, flex: 1 }}>
              <label>{t('admin.inventory.toWarehouse')}</label>
              <select className="input form-select" value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} required>
                <option value="">—</option>
                {warehouseOpts(props.warehouses)}
              </select>
            </div>
          </div>
        ) : (
          <div className="field">
            <label>{t('admin.inventory.warehouse')}</label>
            <select className="input form-select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">—</option>
              {warehouseOpts(props.warehouses)}
            </select>
          </div>
        )}

        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 220, flex: 1 }}>
            <label>{t('admin.inventory.product')}</label>
            <select className="input form-select" value={productId} onChange={(e) => { setProductId(e.target.value); setVariantId(''); }} required>
              <option value="">—</option>
              {props.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          {product && product.variants.length > 0 && (
            <div className="field" style={{ minWidth: 180, flex: 1 }}>
              <label>{t('admin.inventory.variant')}</label>
              <select className="input form-select" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                <option value="">{t('admin.inventory.noVariant')}</option>
                {variantOpts}
              </select>
            </div>
          )}
        </div>

        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField
            label={type === 'ajuste' ? t('admin.inventory.quantity') : t('admin.inventory.quantity')}
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            hint={type === 'ajuste' ? t('admin.inventory.movements.ajuste') : undefined}
          />
          {type === 'entrada' && (
            <TextField label={t('admin.inventory.unitCost')} type="number" step="0.01" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          )}
          <TextField label={t('admin.inventory.reason')} value={reason} onChange={(e) => setReason(e.target.value)} required={type === 'ajuste'} />
        </div>

        {type === 'entrada' && (
          <label className="form-check" style={{ display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
            <input className="form-check-input" type="checkbox" checked={fifo} onChange={(e) => setFifo(e.target.checked)} />
            {t('admin.inventory.fifo')}
          </label>
        )}

        {props.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{props.error}</p>}
        <div className="row">
          <Button
            type="submit"
            disabled={props.saving || !productId || !quantity || (type === 'transferencia' ? !fromWarehouseId || !toWarehouseId : !warehouseId)}
          >
            {props.saving ? t('common.saving') : t('common.create')}
          </Button>
          <Button variant="ghost" type="button" onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
export function InventoryPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission('inventory.manage');

  const [tab, setTab] = useState<Tab>('products');
  const [search, setSearch] = useState('');

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['inventory-products', search],
    queryFn: () => api.get<Product[]>(`${INV}/products${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`),
  });
  const { data: categories } = useQuery({ queryKey: ['inventory-categories'], queryFn: () => api.get<Category[]>(`${INV}/categories`) });
  const { data: brands } = useQuery({ queryKey: ['inventory-brands'], queryFn: () => api.get<Brand[]>(`${INV}/brands`) });
  const { data: suppliers } = useQuery({ queryKey: ['inventory-suppliers'], queryFn: () => api.get<Supplier[]>(`${INV}/suppliers`) });
  const { data: warehouses } = useQuery({ queryKey: ['inventory-warehouses'], queryFn: () => api.get<Warehouse[]>(`${INV}/warehouses`) });
  const { data: stockLevels } = useQuery({
    queryKey: ['inventory-stock-levels'],
    queryFn: () => api.get<StockLevel[]>(`${INV}/reports/stock-levels`),
  });
  const { data: alerts } = useQuery({ queryKey: ['inventory-alerts'], queryFn: () => api.get<StockAlert[]>(`${INV}/alerts`) });
  const { data: movements } = useQuery({ queryKey: ['inventory-movements'], queryFn: () => api.get<StockMovement[]>(`${INV}/movements`) });
  const { data: valuation } = useQuery({ queryKey: ['inventory-valuation'], queryFn: () => api.get<ValuationReport>(`${INV}/reports/valuation`) });

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['inventory-products'] }),
      qc.invalidateQueries({ queryKey: ['inventory-categories'] }),
      qc.invalidateQueries({ queryKey: ['inventory-brands'] }),
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] }),
      qc.invalidateQueries({ queryKey: ['inventory-warehouses'] }),
      qc.invalidateQueries({ queryKey: ['inventory-stock-levels'] }),
      qc.invalidateQueries({ queryKey: ['inventory-alerts'] }),
      qc.invalidateQueries({ queryKey: ['inventory-movements'] }),
      qc.invalidateQueries({ queryKey: ['inventory-valuation'] }),
    ]);

  // Estado de modales
  const [productDialog, setProductDialog] = useState<{ editing: Product | null } | null>(null);
  const [variantDialog, setVariantDialog] = useState<{ product: Product; editing: Variant | null } | null>(null);
  const [catalogDialog, setCatalogDialog] = useState<{ kind: 'category' | 'brand' | 'supplier'; editing: Category | Brand | Supplier | null } | null>(null);
  const [warehouseDialog, setWarehouseDialog] = useState<{ editing: Warehouse | null } | null>(null);
  const [movementDialog, setMovementDialog] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: string; id: string; label: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<{ imported: number; errors: Array<{ row: number; error: string }> } | null>(null);

  const productCreate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`${INV}/products`, body),
    onSuccess: () => invalidate().then(() => setProductDialog(null)),
  });
  const productUpdate = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) => api.patch(`${INV}/products/${vars.id}`, vars.body),
    onSuccess: () => invalidate().then(() => setProductDialog(null)),
  });
  const productDelete = useMutation({
    mutationFn: (id: string) => api.del(`${INV}/products/${id}`),
    onSuccess: () => invalidate().then(() => setConfirm(null)),
  });

  const variantCreate = useMutation({
    mutationFn: (vars: { productId: string; body: Record<string, unknown> }) => api.post(`${INV}/products/${vars.productId}/variants`, vars.body),
    onSuccess: () => invalidate().then(() => setVariantDialog(null)),
  });
  const variantUpdate = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) => api.patch(`${INV}/variants/${vars.id}`, vars.body),
    onSuccess: () => invalidate().then(() => setVariantDialog(null)),
  });
  const variantDelete = useMutation({
    mutationFn: (id: string) => api.del(`${INV}/variants/${id}`),
    onSuccess: () => invalidate().then(() => setConfirm(null)),
  });

  const catalogCreate = useMutation({
    mutationFn: (vars: { kind: 'category' | 'brand' | 'supplier'; body: Record<string, unknown> }) => api.post(`${INV}/${vars.kind === 'category' ? 'categories' : vars.kind === 'brand' ? 'brands' : 'suppliers'}`, vars.body),
    onSuccess: () => invalidate().then(() => setCatalogDialog(null)),
  });
  const catalogUpdate = useMutation({
    mutationFn: (vars: { kind: 'category' | 'brand' | 'supplier'; id: string; body: Record<string, unknown> }) =>
      api.patch(`${INV}/${vars.kind === 'category' ? 'categories' : vars.kind === 'brand' ? 'brands' : 'suppliers'}/${vars.id}`, vars.body),
    onSuccess: () => invalidate().then(() => setCatalogDialog(null)),
  });
  const catalogDelete = useMutation({
    mutationFn: (vars: { kind: 'category' | 'brand' | 'supplier'; id: string }) =>
      api.del(`${INV}/${vars.kind === 'category' ? 'categories' : vars.kind === 'brand' ? 'brands' : 'suppliers'}/${vars.id}`),
    onSuccess: () => invalidate().then(() => setConfirm(null)),
  });

  const warehouseCreate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`${INV}/warehouses`, body),
    onSuccess: () => invalidate().then(() => setWarehouseDialog(null)),
  });
  const warehouseUpdate = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) => api.patch(`${INV}/warehouses/${vars.id}`, vars.body),
    onSuccess: () => invalidate().then(() => setWarehouseDialog(null)),
  });
  const warehouseDelete = useMutation({
    mutationFn: (id: string) => api.del(`${INV}/warehouses/${id}`),
    onSuccess: () => invalidate().then(() => setConfirm(null)),
  });

  const movement = useMutation({
    mutationFn: (vars: { type: StockMovement['type']; body: Record<string, unknown> }) =>
      api.post(`${INV}/stock/${vars.type === 'entrada' ? 'receive' : vars.type === 'salida' ? 'issue' : vars.type === 'ajuste' ? 'adjust' : 'transfer'}`, vars.body),
    onSuccess: () => invalidate().then(() => setMovementDialog(false)),
  });

  const importCsv = useMutation({
    mutationFn: (csv: string) => api.post<{ imported: number; errors: Array<{ row: number; error: string }> }>(`${INV}/import`, { csv }),
    onSuccess: (r) => {
      setImportResult(r);
      invalidate();
    },
  });

  const productList = products ?? [];
  const categoryList = categories ?? [];
  const brandList = brands ?? [];
  const supplierList = suppliers ?? [];
  const warehouseList = warehouses ?? [];
  const stockList = stockLevels ?? [];
  const alertList = alerts ?? [];
  const movementList = movements ?? [];

  const stockById = new Map(stockList.map((s) => [s.id, s]));

  const tabs: Array<{ value: Tab; label: string; icon: string }> = [
    { value: 'products', label: `${t('admin.inventory.tabs.products')} (${productList.length})`, icon: 'bi-box-seam' },
    { value: 'stock', label: `${t('admin.inventory.tabs.stock')} (${stockList.length})`, icon: 'bi-layers' },
    { value: 'movements', label: `${t('admin.inventory.tabs.movements')} (${movementList.length})`, icon: 'bi-arrow-left-right' },
    { value: 'alerts', label: `${t('admin.inventory.tabs.alerts')} (${alertList.length})`, icon: 'bi-exclamation-triangle' },
    { value: 'reports', label: t('admin.inventory.tabs.reports'), icon: 'bi-graph-up' },
    { value: 'catalog', label: t('admin.inventory.tabs.catalog'), icon: 'bi-tags' },
  ];

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

  if (productsLoading) return <Spinner />;

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('admin.inventory.title')}</h1>
        </div>
        {canManage && (
          <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
            <Button onClick={() => setImportOpen((v) => !v)} variant="secondary">
              <i className="bi bi-upload" aria-hidden="true" /> {t('admin.inventory.importCsv')}
            </Button>
            <Button onClick={() => setMovementDialog(true)}>
              <i className="bi bi-plus-lg" aria-hidden="true" /> {t('admin.inventory.newMovement')}
            </Button>
            <Button onClick={() => setProductDialog({ editing: null })}>
              <i className="bi bi-plus-lg" aria-hidden="true" /> {t('admin.inventory.newProduct')}
            </Button>
          </div>
        )}
      </div>

      <Tabs
        items={tabs.map((x) => ({ value: x.value, label: x.label, icon: x.icon }))}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        ariaLabel={t('admin.inventory.title')}
      />

      {/* ── Productos ─────────────────────────────────────────────────────── */}
      {tab === 'products' && (
        <Card>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{t('admin.inventory.items')}</h3>
            <div style={{ maxWidth: 320, flex: 1 }}>
              <TextField
                label={t('common.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('admin.inventory.searchPlaceholder')}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('admin.inventory.sku')}</th>
                  <th>{t('admin.inventory.price')}</th>
                  <th>{t('admin.inventory.quantity')}</th>
                  <th>{t('admin.inventory.variants')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {productList.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.title}</strong>
                      {p.description && <div className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>{p.description}</div>}
                    </td>
                    <td>
                      {p.variants.map((v) => (
                        <div key={v.id} className="row" style={{ gap: 'var(--ws-space-1)' }}>
                          <code>{v.sku}</code>
                          {v.barcode && <span className="muted">{v.barcode}</span>}
                        </div>
                      ))}
                    </td>
                    <td>{fmtMoney(p.price)}</td>
                    <td>{p.stock}</td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => setVariantDialog({ product: p, editing: null })}>
                        <i className="bi bi-plus-lg" aria-hidden="true" /> {t('admin.inventory.addVariant')}
                      </Button>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 'var(--ws-space-1)' }}>
                        <Button variant="secondary" size="sm" onClick={() => setProductDialog({ editing: p })}>
                          {t('common.edit')}
                        </Button>
                        {p.variants.map((v) => (
                          <Button key={v.id} variant="ghost" size="sm" onClick={() => setVariantDialog({ product: p, editing: v })} title={v.sku}>
                            <i className="bi bi-pencil-square" aria-hidden="true" />
                          </Button>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: 'product', id: p.id, label: p.title })}>
                          <i className="bi bi-trash" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {productList.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <p className="muted">{t('admin.inventory.noItems')}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Stock / Almacenes ─────────────────────────────────────────────── */}
      {tab === 'stock' && (
        <>
          {canManage && (
            <Card>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <h3 style={{ margin: 0 }}>{t('admin.inventory.warehouses')}</h3>
                <Button onClick={() => setWarehouseDialog({ editing: null })}>
                  <i className="bi bi-plus-lg" aria-hidden="true" /> {t('admin.inventory.newWarehouse')}
                </Button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      <th>{t('admin.inventory.code')}</th>
                      <th>{t('admin.inventory.address')}</th>
                      <th>{t('admin.inventory.isDefault')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warehouseList.map((w) => (
                      <tr key={w.id}>
                        <td>{w.name}</td>
                        <td><code>{w.code}</code></td>
                        <td>{w.address ?? '—'}</td>
                        <td>{w.isDefault ? <Badge variant="primary">{t('admin.inventory.isDefault')}</Badge> : '—'}</td>
                        <td>
                          <div className="row" style={{ gap: 'var(--ws-space-1)' }}>
                            <Button variant="secondary" size="sm" onClick={() => setWarehouseDialog({ editing: w })}>{t('common.edit')}</Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: 'warehouse', id: w.id, label: w.name })}>
                              <i className="bi bi-trash" aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card>
            <h3 style={{ marginTop: 0 }}>{t('admin.inventory.stock')}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('admin.inventory.product')}</th>
                    <th>{t('admin.inventory.variant')}</th>
                    <th>{t('admin.inventory.warehouse')}</th>
                    <th>{t('admin.inventory.quantity')}</th>
                    <th>{t('admin.inventory.minQuantity')}</th>
                    <th>{t('admin.inventory.criticalQuantity')}</th>
                    <th>{t('admin.inventory.averageCost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stockList.map((s) => (
                    <tr key={s.id} style={s.quantity <= s.criticalQuantity ? { background: 'var(--ws-danger-soft, var(--ws-surface-2))' } : s.quantity <= s.minQuantity ? { background: 'var(--ws-warning-soft, var(--ws-surface-2))' } : undefined}>
                      <td>{s.product.title}</td>
                      <td>{s.variant ? <code>{s.variant.sku}</code> : '—'}</td>
                      <td>{s.warehouse.name}</td>
                      <td>{s.quantity}</td>
                      <td>{s.minQuantity}</td>
                      <td>{s.criticalQuantity}</td>
                      <td>{fmtMoney(s.averageCost)}</td>
                    </tr>
                  ))}
                  {stockList.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <p className="muted">{t('admin.inventory.empty')}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ── Movimientos ───────────────────────────────────────────────────── */}
      {tab === 'movements' && (
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('admin.inventory.movements.title')}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('admin.inventory.type')}</th>
                  <th>{t('admin.inventory.product')}</th>
                  <th>{t('admin.inventory.quantity')}</th>
                  <th>{t('admin.inventory.before')}</th>
                  <th>{t('admin.inventory.after')}</th>
                  <th>{t('admin.inventory.reason')}</th>
                  <th>{t('admin.inventory.date')}</th>
                </tr>
              </thead>
              <tbody>
                {movementList.map((m) => {
                  const productTitle = productList.find((p) => p.id === m.productId)?.title ?? m.productId;
                  return (
                    <tr key={m.id}>
                      <td><Badge variant={MOVE_TONE[m.type]}>{t(`admin.inventory.movements.${m.type}`)}</Badge></td>
                      <td>{productTitle}</td>
                      <td style={{ color: m.quantity >= 0 ? 'var(--ws-success)' : 'var(--ws-danger)', fontWeight: 600 }}>
                        {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td>{m.quantityBefore}</td>
                      <td>{m.quantityAfter}</td>
                      <td>{m.reason ?? '—'}</td>
                      <td>{fmtDate(m.createdAt)}</td>
                    </tr>
                  );
                })}
                {movementList.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <p className="muted">{t('admin.inventory.empty')}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Alertas ───────────────────────────────────────────────────────── */}
      {tab === 'alerts' && (
        <Card>
          <h3 style={{ marginTop: 0 }}>{t('admin.inventory.lowStock')}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('admin.inventory.product')}</th>
                  <th>{t('admin.inventory.variant')}</th>
                  <th>{t('admin.inventory.warehouse')}</th>
                  <th>{t('admin.inventory.quantity')}</th>
                  <th>{t('admin.inventory.minQuantity')}</th>
                  <th>{t('admin.inventory.level')}</th>
                </tr>
              </thead>
              <tbody>
                {alertList.map((a) => {
                  const sl = stockById.get(a.id);
                  return (
                    <tr key={a.id}>
                      <td>{sl?.product.title ?? a.productId}</td>
                      <td>{sl?.variant ? <code>{sl.variant.sku}</code> : '—'}</td>
                      <td>{sl?.warehouse.name ?? a.warehouseId}</td>
                      <td style={{ color: 'var(--ws-danger)', fontWeight: 600 }}>{a.quantity}</td>
                      <td>{a.minQuantity}</td>
                      <td><Badge variant={LEVEL_TONE[a.level]}>{t(LEVEL_KEY[a.level])}</Badge></td>
                    </tr>
                  );
                })}
                {alertList.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <p className="muted">{t('admin.inventory.noLowStock')}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Reportes ──────────────────────────────────────────────────────── */}
      {tab === 'reports' && (
        <div className="stack">
          <Card>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{t('admin.inventory.valuation')}</h3>
              <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
                <Button variant="secondary" onClick={() => downloadFile(`${INV}/export.csv?type=levels`, 'inventario-stock.csv')}>
                  <i className="bi bi-download" aria-hidden="true" /> {t('admin.inventory.exportCsv')}
                </Button>
                <Button variant="secondary" onClick={() => downloadFile(`${INV}/export.csv?type=movements`, 'inventario-movimientos.csv')}>
                  <i className="bi bi-download" aria-hidden="true" /> {t('admin.inventory.movements.title')}
                </Button>
              </div>
            </div>
            <div className="row" style={{ gap: 'var(--ws-space-4)', marginTop: 'var(--ws-space-3)' }}>
              <Card>
                <h4 style={{ margin: 0 }}>{t('admin.inventory.totalValue')}</h4>
                <p style={{ fontSize: 'var(--ws-font-size-lg)', margin: 'var(--ws-space-1) 0 0' }}>{fmtMoney(valuation?.totalValue ?? 0)}</p>
              </Card>
              <Card>
                <h4 style={{ margin: 0 }}>{t('admin.inventory.totalQuantity')}</h4>
                <p style={{ fontSize: 'var(--ws-font-size-lg)', margin: 'var(--ws-space-1) 0 0' }}>{valuation?.totalQuantity ?? 0}</p>
              </Card>
            </div>
            <div style={{ overflowX: 'auto', marginTop: 'var(--ws-space-3)' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('admin.inventory.product')}</th>
                    <th>{t('admin.inventory.quantity')}</th>
                    <th>{t('admin.inventory.averageCost')}</th>
                    <th>{t('admin.inventory.totalValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(valuation?.lines ?? []).map((l) => (
                    <tr key={`${l.productId}-${l.warehouseId}`}>
                      <td>{l.title}</td>
                      <td>{l.quantity}</td>
                      <td>{fmtMoney(l.averageCost)}</td>
                      <td>{fmtMoney(l.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── Catálogo ──────────────────────────────────────────────────────── */}
      {tab === 'catalog' && (
        <div className="grid-2">
          <Card>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <h3 style={{ margin: 0 }}>{t('admin.inventory.categories')}</h3>
              <Button size="sm" onClick={() => setCatalogDialog({ kind: 'category', editing: null })}>
                <i className="bi bi-plus-lg" aria-hidden="true" /> {t('admin.inventory.newCategory')}
              </Button>
            </div>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--ws-space-3)' }}>
              {categoryList.map((c) => (
                <li key={c.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
                  <span>{c.name}</span>
                  <div className="row" style={{ gap: 'var(--ws-space-1)' }}>
                    <Button variant="ghost" size="sm" onClick={() => setCatalogDialog({ kind: 'category', editing: c })}>{t('common.edit')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: 'category', id: c.id, label: c.name })}><i className="bi bi-trash" aria-hidden="true" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <h3 style={{ margin: 0 }}>{t('admin.inventory.brands')}</h3>
              <Button size="sm" onClick={() => setCatalogDialog({ kind: 'brand', editing: null })}>
                <i className="bi bi-plus-lg" aria-hidden="true" /> {t('admin.inventory.newBrand')}
              </Button>
            </div>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--ws-space-3)' }}>
              {brandList.map((b) => (
                <li key={b.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
                  <span>{b.name}</span>
                  <div className="row" style={{ gap: 'var(--ws-space-1)' }}>
                    <Button variant="ghost" size="sm" onClick={() => setCatalogDialog({ kind: 'brand', editing: b })}>{t('common.edit')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: 'brand', id: b.id, label: b.name })}><i className="bi bi-trash" aria-hidden="true" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <h3 style={{ margin: 0 }}>{t('admin.inventory.suppliers')}</h3>
              <Button size="sm" onClick={() => setCatalogDialog({ kind: 'supplier', editing: null })}>
                <i className="bi bi-plus-lg" aria-hidden="true" /> {t('admin.inventory.newSupplier')}
              </Button>
            </div>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--ws-space-3)' }}>
              {supplierList.map((s) => (
                <li key={s.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
                  <span>
                    <strong>{s.name}</strong>
                    {s.email && <div className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>{s.email}</div>}
                  </span>
                  <div className="row" style={{ gap: 'var(--ws-space-1)' }}>
                    <Button variant="ghost" size="sm" onClick={() => setCatalogDialog({ kind: 'supplier', editing: s })}>{t('common.edit')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: 'supplier', id: s.id, label: s.name })}><i className="bi bi-trash" aria-hidden="true" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* ── Modales ───────────────────────────────────────────────────────── */}
      {productDialog && (
        <ProductFormDialog
          open
          editing={productDialog.editing}
          categories={categoryList}
          brands={brandList}
          suppliers={supplierList}
          saving={productCreate.isPending || productUpdate.isPending}
          error={productCreate.error?.message ?? productUpdate.error?.message ?? ''}
          onClose={() => setProductDialog(null)}
          onSave={(body) => (productDialog.editing ? productUpdate.mutate({ id: productDialog.editing.id, body }) : productCreate.mutate(body))}
        />
      )}

      {variantDialog && (
        <VariantFormDialog
          open
          product={variantDialog.product}
          editing={variantDialog.editing}
          saving={variantCreate.isPending || variantUpdate.isPending}
          error={variantCreate.error?.message ?? variantUpdate.error?.message ?? ''}
          onClose={() => setVariantDialog(null)}
          onSave={(body) =>
            variantDialog.editing
              ? variantUpdate.mutate({ id: variantDialog.editing.id, body })
              : variantCreate.mutate({ productId: variantDialog.product.id, body })
          }
        />
      )}

      {catalogDialog && (
        <CatalogFormDialog
          open
          kind={catalogDialog.kind}
          editing={catalogDialog.editing}
          categories={categoryList}
          saving={catalogCreate.isPending || catalogUpdate.isPending}
          error={catalogCreate.error?.message ?? catalogUpdate.error?.message ?? ''}
          onClose={() => setCatalogDialog(null)}
          onSave={(body) =>
            catalogDialog.editing
              ? catalogUpdate.mutate({ kind: catalogDialog.kind, id: (catalogDialog.editing as { id: string }).id, body })
              : catalogCreate.mutate({ kind: catalogDialog.kind, body })
          }
        />
      )}

      {warehouseDialog && (
        <WarehouseFormDialog
          open
          editing={warehouseDialog.editing}
          saving={warehouseCreate.isPending || warehouseUpdate.isPending}
          error={warehouseCreate.error?.message ?? warehouseUpdate.error?.message ?? ''}
          onClose={() => setWarehouseDialog(null)}
          onSave={(body) => (warehouseDialog.editing ? warehouseUpdate.mutate({ id: warehouseDialog.editing.id, body }) : warehouseCreate.mutate(body))}
        />
      )}

      {movementDialog && (
        <MovementFormDialog
          open
          products={productList}
          warehouses={warehouseList}
          stockLevels={stockList}
          saving={movement.isPending}
          error={movement.error?.message ?? ''}
          onClose={() => setMovementDialog(false)}
          onSave={(type, body) => movement.mutate({ type, body })}
        />
      )}

      {importOpen && (
        <Dialog open onClose={() => setImportOpen(false)} title={t('admin.inventory.importCsv')}>
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>
              {t('admin.inventory.importCsvHint')}
            </p>
            <textarea
              className="input"
              rows={8}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'sku,warehouse,quantity,unitCost\nSKU-001,MAIN,10,500'}
            />
            {importResult && (
              <div className="stack">
                <p style={{ color: 'var(--ws-success)', margin: 0 }}>
                  {t('admin.inventory.importResult', { count: importResult.imported })}
                </p>
                {importResult.errors.map((e) => (
                  <p key={`${e.row}-${e.error}`} style={{ color: 'var(--ws-danger)', margin: 0, fontSize: 'var(--ws-font-size-sm)' }}>
                    {t('admin.inventory.importRow', { row: e.row })}: {e.error}
                  </p>
                ))}
              </div>
            )}
            {importCsv.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{importCsv.error.message}</p>}
            <div className="row">
              <Button disabled={importCsv.isPending || !importText.trim()} onClick={() => importCsv.mutate(importText)}>
                {importCsv.isPending ? t('common.saving') : t('admin.inventory.importCsv')}
              </Button>
              <Button variant="ghost" onClick={() => setImportOpen(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={t('common.delete')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (!confirm) return;
          const c = confirm;
          if (c.kind === 'product') productDelete.mutate(c.id);
          else if (c.kind === 'warehouse') warehouseDelete.mutate(c.id);
          else if (c.kind === 'category') catalogDelete.mutate({ kind: 'category', id: c.id });
          else if (c.kind === 'brand') catalogDelete.mutate({ kind: 'brand', id: c.id });
          else if (c.kind === 'supplier') catalogDelete.mutate({ kind: 'supplier', id: c.id });
          else if (c.kind === 'variant') variantDelete.mutate(c.id);
        }}
        onCancel={() => setConfirm(null)}
      >
        {t('admin.inventory.deleteConfirm', { name: confirm?.label ?? '' })}
      </ConfirmDialog>
    </div>
  );
}
