import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { listUpsellTransactionsForCsv } from '@/lib/admin/queries';
import {
  upsellTransactionsToCsv,
  upsellCsvFilename,
  type UpsellCsvRow,
} from '@/lib/admin/csv';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { property } = await requireAdmin();
  const rows = (await listUpsellTransactionsForCsv(
    property.id,
  )) as unknown as UpsellCsvRow[];
  const body = upsellTransactionsToCsv(rows);
  const filename = upsellCsvFilename(property.slug);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
