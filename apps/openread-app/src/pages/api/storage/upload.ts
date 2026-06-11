import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import {
  getSubscriptionPlan,
  validateUserAndToken,
  STORAGE_QUOTA_GRACE_BYTES,
} from '@/utils/access';
import { getDownloadSignedUrl, getUploadSignedUrl } from '@/utils/object';
import { OPENREAD_PUBLIC_STORAGE_BASE_URL } from '@/services/constants';
import { assertCanIncreaseLibrary, isLibraryLimitError } from '@/lib/library-limit';
import { getStorageQuota, incrementStorageUsed } from '@/lib/storage-quota';
import type { UserPlan } from '@/types/quota';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) {
    return res.status(403).json({ error: 'Not authenticated' });
  }

  const { fileName, fileSize, bookHash, temp = false } = req.body;
  if (temp) {
    try {
      const datetime = new Date();
      const timeStr = datetime.toISOString().replace(/[-:]/g, '').replace('T', '').slice(0, 10);
      const userStr = user.id.slice(0, 8);
      const fileKey = `temp/img/${timeStr}/${userStr}/${fileName}`;
      const bucketName = process.env['TEMP_STORAGE_PUBLIC_BUCKET_NAME'] || '';
      const uploadUrl = await getUploadSignedUrl(fileKey, fileSize, 1800, bucketName);
      const downloadUrl = await getDownloadSignedUrl(fileKey, 3 * 86400, bucketName);
      const pathname = new URL(downloadUrl).pathname;
      const publicBaseUrl = OPENREAD_PUBLIC_STORAGE_BASE_URL;
      const publicDownloadUrl = `${publicBaseUrl}${pathname.replace(`/${bucketName}`, '')}`;
      return res.status(200).json({
        uploadUrl,
        downloadUrl: publicDownloadUrl,
      });
    } catch (error) {
      console.error('Error creating presigned post for temp file:', error);
      return res.status(500).json({ error: 'Could not create presigned post' });
    }
  }

  try {
    if (!fileName || !fileSize) {
      return res.status(400).json({ error: 'Missing file info' });
    }

    // P9.3: Use file_type column instead of filename pattern matching
    const isCoverFile =
      fileName.toLowerCase().endsWith('cover.png') ||
      fileName.toLowerCase().endsWith('cover.jpg') ||
      fileName.toLowerCase().endsWith('cover.jpeg');
    const fileType = isCoverFile ? 'cover' : 'book';

    // Tier-based storage enforcement via storage-quota module
    const plan = getSubscriptionPlan(token) as UserPlan;
    const quota = await getStorageQuota(user.id, plan);

    // Defensive guard for configurations with 0 GB storage.
    if (quota.totalBytes === 0) {
      return res.status(403).json({
        error: 'STORAGE_NOT_AVAILABLE',
        message: 'Cloud storage is not available on your current plan',
        upgradeUrl: '/settings/billing#plans',
      });
    }

    // Over limit: block upload with upgrade/remove-files suggestion
    if (quota.usedBytes + fileSize > quota.totalBytes + STORAGE_QUOTA_GRACE_BYTES) {
      return res.status(403).json({
        error: 'STORAGE_LIMIT_REACHED',
        message: 'Storage limit reached. Upgrade your plan or remove files.',
        used: quota.usedBytes,
        limit: quota.totalBytes,
        upgradeUrl: '/settings/billing#plans',
      });
    }

    if (fileType === 'book') {
      try {
        await assertCanIncreaseLibrary(user.id, plan, { bookHash });
      } catch (error) {
        if (isLibraryLimitError(error)) {
          return res.status(error.status).json({
            error: error.code,
            message: error.message,
            ...error.details,
          });
        }
        throw error;
      }
    }

    const fileKey = `${user.id}/${fileName}`;
    const supabase = createSupabaseAdminClient();
    const { data: existingRecord, error: fetchError } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id)
      .eq('file_key', fileKey)
      .limit(1)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return res.status(500).json({ error: fetchError.message });
    }
    let objSize = fileSize;
    let storageIncrementBytes = 0;
    if (existingRecord) {
      objSize = existingRecord.file_size || fileSize;

      // Reupload after a user delete must reactivate the canonical registry row.
      // The object key is unique per user path, so inserting another row would be
      // duplicate state; clearing deleted_at makes download/list APIs see it again.
      if (existingRecord.deleted_at) {
        const { error: updateError } = await supabase
          .from('files')
          .update({
            book_hash: bookHash,
            file_size: fileSize,
            file_type: fileType,
            deleted_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingRecord.id);

        if (updateError) {
          return res.status(500).json({ error: updateError.message });
        }
        objSize = fileSize;
        storageIncrementBytes = fileSize;
      }
    } else {
      storageIncrementBytes = fileSize;
      const { data: inserted, error: insertError } = await supabase
        .from('files')
        .insert([
          {
            user_id: user.id,
            book_hash: bookHash,
            file_key: fileKey,
            file_size: fileSize,
            file_type: fileType,
          },
        ])
        .select()
        .single();
      console.log('Inserted record:', inserted);
      if (insertError) {
        // P9.2: Handle FK violations with clear error message
        if ((insertError as { code?: string }).code === '23503') {
          return res.status(400).json({ error: 'Invalid user reference' });
        }
        return res.status(500).json({ error: insertError.message });
      }
    }

    try {
      const uploadUrl = await getUploadSignedUrl(fileKey, objSize, 1800);

      // Track storage usage atomically when a file becomes quota-active.
      // Existing active reuploads are already counted, but new rows and
      // soft-deleted row reactivations must add their bytes to quota usage.
      if (storageIncrementBytes > 0) {
        await incrementStorageUsed(user.id, storageIncrementBytes);
      }

      res.status(200).json({
        uploadUrl,
        fileKey,
        usage: quota.usedBytes + storageIncrementBytes,
        quota: quota.totalBytes,
      });
    } catch (error) {
      console.error('Error creating presigned post:', error);
      res.status(500).json({ error: 'Could not create presigned post' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
