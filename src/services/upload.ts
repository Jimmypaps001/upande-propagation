/**
 * Attaching a file to a Frappe document from a handset.
 *
 * Frappe's `/api/method/upload_file` takes a multipart body and, given a
 * doctype and docname, both stores the file and attaches it. There is no
 * whitelisted wrapper for it in this app's server module and there should not
 * be: it is a framework endpoint, the permission check is the framework's, and
 * routing it through a module of ours would only add a name to keep in step.
 *
 * Why this exists at all: a goods receipt on some sites cannot be submitted
 * without the supplier's paperwork attached to it. The photo is taken once, at
 * the gate, against the delivery -- and the server copies it onto the receipt
 * the delivery becomes, so nobody in the office has to go and find it again.
 */
import { api } from './api';

export interface UploadedFile {
  name: string;
  file_url: string;
  file_name: string;
}

/**
 * Upload a local file and attach it to a document.
 *
 * React Native's FormData takes `{uri, name, type}` in place of a Blob; that is
 * the platform's own shape, not a hack, and fetch/axios turn it into a proper
 * multipart part.
 */
export async function attachToDoc(input: {
  doctype: string;
  docname: string;
  uri: string;
  fileName?: string;
  mimeType?: string;
  private?: boolean;
}): Promise<UploadedFile> {
  const form = new FormData();
  const name = input.fileName ?? input.uri.split('/').pop() ?? 'photo.jpg';
  form.append('file', {
    uri: input.uri,
    name,
    type: input.mimeType ?? guessType(name),
  } as unknown as Blob);
  form.append('doctype', input.doctype);
  form.append('docname', input.docname);
  form.append('is_private', input.private === false ? '0' : '1');

  const res = await api<{ message?: UploadedFile }>({
    method: 'POST',
    url: '/api/method/upload_file',
    data: form,
    // Left to the platform on purpose: axios must not set a Content-Type
    // without the multipart boundary it alone knows.
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  if (!res.message) throw new Error('The upload came back empty.');
  return res.message;
}

function guessType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'pdf') return 'application/pdf';
  return 'image/jpeg';
}
