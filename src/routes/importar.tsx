import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { db, type BankTransaction } from '@/db/schema';
import { formatCOP } from '@/lib/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Upload, Check, X, FileUp } from 'lucide-react';

export const Route = createFileRoute('/importar')({
  component: ImportarPage,
});

interface ParsedRow {
  fecha: string;
  documento: string;
  oficina: string;
  descripcion: string;
  referencia: string;
  valor: number;
}

function ImportarPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsed' | 'importing' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const pendingTransactions = useLiveQuery(
    () => db.bankTransactions.where('status').equals('pending').toArray()
  );

  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray());

  const handleFile = useCallback((file: File) => {
    setError(null);
    setParsedRows([]);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: '', // auto-detect (TSV or CSV)
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`Error al parsear: ${results.errors[0]?.message ?? 'Error desconocido'}`);
          return;
        }

        // Normalize headers (Bancolombia uses various cases)
        const rows: ParsedRow[] = results.data
          .map((row) => {
            const keys = Object.keys(row);
            const get = (patterns: string[]) => {
              const key = keys.find((k) =>
                patterns.some((p) => k.toUpperCase().includes(p))
              );
              return key ? (row[key] ?? '').trim() : '';
            };

            const valorStr = get(['VALOR', 'MONTO', 'AMOUNT']);
            const valor = parseFloat(valorStr.replace(/[,$\s]/g, '').replace(/\./g, ''));

            return {
              fecha: get(['FECHA', 'DATE']),
              documento: get(['DOCUMENTO', 'DOC']),
              oficina: get(['OFICINA', 'OFFICE']),
              descripcion: get(['DESCRIPCI', 'DESCRIPTION', 'DESC']),
              referencia: get(['REFERENCIA', 'REF']),
              valor: isNaN(valor) ? 0 : valor,
            };
          })
          .filter((r) => r.descripcion && r.valor !== 0);

        if (rows.length === 0) {
          setError('No se encontraron transacciones válidas en el archivo.');
          return;
        }

        setParsedRows(rows);
        setImportStatus('parsed');
      },
      error: (err) => {
        setError(`Error leyendo archivo: ${err.message}`);
      },
    });
  }, []);

  async function handleImport() {
    setImportStatus('importing');
    const batchId = `import-${Date.now()}`;

    const transactions: BankTransaction[] = parsedRows.map((row, i) => {
      const suggestedCategory = suggestCategory(row.descripcion, categories ?? []);
      return {
        id: `tx-${batchId}-${i}`,
        importBatch: batchId,
        transactionDate: parseDate(row.fecha),
        description: row.descripcion,
        reference: row.referencia,
        amount: row.valor,
        office: row.oficina,
        categoryId: suggestedCategory?.id,
        status: 'pending' as const,
        importedAt: new Date(),
      };
    });

    await db.bankTransactions.bulkAdd(transactions);
    setParsedRows([]);
    setImportStatus('done');
  }

  async function handleAccept(txId: string) {
    await db.bankTransactions.update(txId, { status: 'accepted' });
  }

  async function handleReject(txId: string) {
    await db.bankTransactions.update(txId, { status: 'rejected' });
  }

  async function handleCategoryChange(txId: string, categoryId: string) {
    await db.bankTransactions.update(txId, { categoryId });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-4 pb-20 md:pb-6 md:pl-56">
      <h2 className="text-xl font-bold">Importar Extracto Bancario</h2>

      {/* Drop zone */}
      <Card
        className={cn(
          'border-2 border-dashed transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileUp className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Arrastra tu archivo CSV/TSV aquí</p>
          <p className="text-xs text-muted-foreground mt-1">
            Formato: Bancolombia (FECHA, DOCUMENTO, OFICINA, DESCRIPCIÓN, REFERENCIA, VALOR)
          </p>
          <label className="mt-4 cursor-pointer">
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={handleFileInput}
            />
            <span className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors">
              <Upload className="h-4 w-4" /> Seleccionar archivo
            </span>
          </label>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Preview parsed rows */}
      {importStatus === 'parsed' && parsedRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Vista previa — {parsedRows.length} transacciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="max-h-64 overflow-y-auto space-y-1">
              {parsedRows.slice(0, 20).map((row, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded border p-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.descripcion}</p>
                    <p className="text-xs text-muted-foreground">{row.fecha}</p>
                  </div>
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      row.valor < 0 ? 'text-negative' : 'text-positive'
                    )}
                  >
                    {formatCOP(row.valor)}
                  </span>
                </div>
              ))}
              {parsedRows.length > 20 && (
                <p className="text-center text-xs text-muted-foreground">
                  ... y {parsedRows.length - 20} más
                </p>
              )}
            </div>
            <Button className="w-full mt-3" onClick={handleImport}>
              <Check className="h-4 w-4" /> Importar {parsedRows.length} transacciones
            </Button>
          </CardContent>
        </Card>
      )}

      {importStatus === 'done' && (
        <Card className="border-positive">
          <CardContent className="p-4 text-center text-sm text-positive font-medium">
            ✓ Importación completada. Revisa las transacciones pendientes abajo.
          </CardContent>
        </Card>
      )}

      {/* Pending transactions for review */}
      {(pendingTransactions?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Transacciones por categorizar ({pendingTransactions?.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingTransactions?.map((tx) => (
              <div key={tx.id} className="rounded border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {tx.transactionDate.toLocaleDateString('es-CO')} — {tx.reference}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums ml-2',
                      tx.amount < 0 ? 'text-negative' : 'text-positive'
                    )}
                  >
                    {formatCOP(tx.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={tx.categoryId ?? ''}
                    onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                    className="flex-1 h-8 rounded border border-input bg-background px-2 text-xs"
                  >
                    <option value="">Sin categoría</option>
                    {(categories ?? []).map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                  {tx.categoryId && (
                    <Badge variant="success" className="text-xs">
                      Sugerida
                    </Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-positive"
                    onClick={() => handleAccept(tx.id)}
                    aria-label="Aceptar"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleReject(tx.id)}
                    aria-label="Rechazar"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function parseDate(dateStr: string): Date {
  // Handle formats: YYYY/MM/DD, DD/MM/YYYY, YYYY-MM-DD
  if (/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(dateStr)) {
    return new Date(dateStr.replace(/\//g, '-'));
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split('/');
    return new Date(`${y}-${m}-${d}`);
  }
  return new Date(dateStr);
}

function suggestCategory(
  description: string,
  categories: { id: string; name: string }[]
): { id: string } | undefined {
  const desc = description.toUpperCase();
  const rules: [string[], string][] = [
    [['NETFLIX', 'SPOTIFY', 'SMARTFIT', 'CHATGPT'], 'cat-debitos'],
    [['UBER', 'TANQUE', 'GASOLINA', 'EDS ', 'PRIMAX', 'TERPEL'], 'cat-tanqueadas'],
    [['EXITO', 'JUMBO', 'CARULLA', 'D1 ', 'EURO', 'OLIMPICA', 'MERCADO'], 'cat-para-gastar'],
    [['PEAJE'], 'cat-peaje-sopetran'],
    [['ADMINISTRACION', 'ADMON'], 'cat-administraciones'],
    [['EPM', 'ENERGIA', 'ACUEDUCTO', 'GAS NATURAL', 'UNE'], 'cat-servicios'],
    [['CLARO', 'TIGO', 'MOVISTAR'], 'cat-celulares'],
  ];

  for (const [keywords, catId] of rules) {
    if (keywords.some((kw) => desc.includes(kw))) {
      const found = categories.find((c) => c.id === catId);
      if (found) return found;
    }
  }
  return undefined;
}
