import { NextResponse } from 'next/server';
import { createJob } from '@/lib/server/services/jobs/createJob';
import { JobsRepository } from '@/lib/server/db/repositories/jobs';
import { looksLikeSRT } from '@/lib/server/services/srt/parse';

import { verifyRequestUser } from '@/lib/server/auth';

export async function POST(req: Request) {
  try {
    const user = await verifyRequestUser(req);
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'You must be signed in to translate subtitles.' } },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const targetLanguage = formData.get('targetLanguage') as string | null;
    const model = (formData.get('model') as string | null) || 'gemini-2.0-flash';
    const toneStyle = (formData.get('toneStyle') as string | null) || 'natural';
    const glossary = (formData.get('glossary') as string | null) || '';

    if (!file) {
      return NextResponse.json(
        { error: { code: 'NO_FILE', message: 'No subtitle file uploaded.' } },
        { status: 400 }
      );
    }

    if (!targetLanguage) {
      return NextResponse.json(
        { error: { code: 'MISSING_PARAM', message: 'targetLanguage is required.' } },
        { status: 400 }
      );
    }

    const srtContent = await file.text();
    if (!looksLikeSRT(srtContent)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_SRT',
            message: 'The file does not appear to be a valid SRT file (missing timestamp markers like -->).',
          },
        },
        { status: 400 }
      );
    }

    const result = await createJob({
      userId: user.uid,
      filename: file.name,
      targetLanguage,
      model,
      toneStyle,
      glossary,
      srtContent,
    });

    const validationIssues = await JobsRepository.getValidationIssues(result.job.id);

    return NextResponse.json(
      {
        jobId: result.job.id,
        status: result.job.status,
        valid: result.valid,
        validationIssues,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[API Upload Error]', error);
    return NextResponse.json(
      { error: { code: 'UPLOAD_FAILED', message: error?.message || 'Failed to upload subtitle file.' } },
      { status: 500 }
    );
  }
}
