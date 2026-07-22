export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { JobsRepository } from '@/lib/server/db/repositories/jobs';
import { ExportsRepository } from '@/lib/server/db/repositories/exports';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing job id' } }, { status: 400 });
    }

    const job = await JobsRepository.findById(id);
    if (!job) {
      return NextResponse.json({ error: { message: 'Job not found' } }, { status: 404 });
    }

    const exportRecord = await ExportsRepository.findByJobId(id);
    if (!exportRecord) {
      return NextResponse.json(
        {
          error: {
            code: 'EXPORT_NOT_FOUND',
            message: 'Export file has not been built yet. Make sure translation is completed.',
          },
        },
        { status: 404 }
      );
    }

    return new NextResponse(exportRecord.content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(exportRecord.filename)}"`,
      },
    });
  } catch (error: any) {
    console.error('[API Export Error]', error);
    return NextResponse.json(
      { error: { message: error?.message || 'Failed to export job' } },
      { status: 500 }
    );
  }
}
