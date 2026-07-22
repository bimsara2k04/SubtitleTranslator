export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { JobsRepository } from '@/lib/server/db/repositories/jobs';
import { verifyRequestUser } from '@/lib/server/auth';

export async function GET(req: Request) {
  try {
    const user = await verifyRequestUser(req);
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'You must be signed in to view translation history.' } },
        { status: 401 }
      );
    }

    const jobs = await JobsRepository.findByUserId(user.uid);

    return NextResponse.json({ jobs });
  } catch (error: any) {
    console.error('[API GetHistory Error]', error);
    return NextResponse.json(
      { error: { message: error?.message || 'Failed to fetch translation history' } },
      { status: 500 }
    );
  }
}
