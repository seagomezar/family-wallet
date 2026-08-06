import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, Database, Trash2 } from 'lucide-react';

export const Route = createFileRoute('/ajustes')({
  component: AjustesPage,
});

function AjustesPage() {
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');

  const budgetCount = useLiveQuery(() => db.budgets.count());
  const categoryCount = useLiveQuery(() => db.categories.count());
  const expenseCount = useLiveQuery(() => db.expenses.count());
  const transactionCount = useLiveQuery(() => db.bankTransactions.count());

  async function handleExport() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      budgets: await db.budgets.toArray(),
      categories: await db.categories.toArray(),
      expenses: await db.expenses.toArray(),
      bankTransactions: await db.bankTransactions.toArray(),
      savingsGoals: await db.savingsGoals.toArray(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billetera-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text) as {
        version?: number;
        budgets?: unknown[];
        categories?: unknown[];
        expenses?: unknown[];
        bankTransactions?: unknown[];
        savingsGoals?: unknown[];
      };

      if (!data.version) {
        throw new Error('Archivo no válido: falta versión.');
      }

      // Clear existing data and import
      await db.transaction('rw', db.budgets, db.categories, db.expenses, db.bankTransactions, db.savingsGoals, async () => {
        await db.budgets.clear();
        await db.categories.clear();
        await db.expenses.clear();
        await db.bankTransactions.clear();
        await db.savingsGoals.clear();

        if (data.budgets) await db.budgets.bulkAdd(data.budgets as Parameters<typeof db.budgets.bulkAdd>[0]);
        if (data.categories) await db.categories.bulkAdd(data.categories as Parameters<typeof db.categories.bulkAdd>[0]);
        if (data.expenses) await db.expenses.bulkAdd(data.expenses as Parameters<typeof db.expenses.bulkAdd>[0]);
        if (data.bankTransactions) await db.bankTransactions.bulkAdd(data.bankTransactions as Parameters<typeof db.bankTransactions.bulkAdd>[0]);
        if (data.savingsGoals) await db.savingsGoals.bulkAdd(data.savingsGoals as Parameters<typeof db.savingsGoals.bulkAdd>[0]);
      });

      setImportStatus('success');
      setImportMessage('Respaldo restaurado exitosamente.');
    } catch (err) {
      setImportStatus('error');
      setImportMessage(err instanceof Error ? err.message : 'Error desconocido');
    }

    // Reset input
    e.target.value = '';
  }

  async function handleClearData() {
    if (!confirm('¿Estás seguro? Esto eliminará TODOS los datos. Exporta un respaldo primero.')) return;
    await db.transaction('rw', db.budgets, db.categories, db.expenses, db.bankTransactions, db.savingsGoals, async () => {
      await db.budgets.clear();
      await db.categories.clear();
      await db.expenses.clear();
      await db.bankTransactions.clear();
      await db.savingsGoals.clear();
    });
  }

  return (
    <div className="space-y-4 pb-20 md:pb-6 md:pl-56">
      <h2 className="text-xl font-bold">Ajustes y Datos</h2>

      {/* Data Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> Resumen de Datos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Presupuestos</p>
              <p className="text-xl font-bold">{budgetCount ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Categorías</p>
              <p className="text-xl font-bold">{categoryCount ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Gastos</p>
              <p className="text-xl font-bold">{expenseCount ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Transacciones importadas</p>
              <p className="text-xl font-bold">{transactionCount ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exportar Respaldo</CardTitle>
          <CardDescription>Descarga todos tus datos como archivo JSON.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport}>
            <Download className="h-4 w-4" /> Exportar JSON
          </Button>
        </CardContent>
      </Card>

      {/* Import */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restaurar Respaldo</CardTitle>
          <CardDescription>
            Importa un archivo JSON previamente exportado. ⚠️ Esto reemplaza todos los datos actuales.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="cursor-pointer">
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            <span className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
              <Upload className="h-4 w-4" /> Seleccionar archivo JSON
            </span>
          </label>
          {importStatus !== 'idle' && (
            <p
              className={
                importStatus === 'success' ? 'text-sm text-positive' : 'text-sm text-destructive'
              }
            >
              {importMessage}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Zona de Peligro</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleClearData}>
            <Trash2 className="h-4 w-4" /> Borrar todos los datos
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
