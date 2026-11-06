/**
 * The name and type to upload a résumé under.
 *
 * Neither can be taken from storage. Résumés are served as text/plain, and some
 * stored names have no extension ("1789619121166.Dheeraj_Resume"), which Greenhouse
 * rejects with "Invalid file format selected". The file's own bytes say what it is.
 */

const TYPES = [
  { magic: "%PDF", ext: "pdf", mime: "application/pdf" },
  { magic: "PK\u0003\u0004", ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { magic: "ÐÏ\u0011à", ext: "doc", mime: "application/msword" },
  { magic: "{\\rtf", ext: "rtf", mime: "application/rtf" },
]

export function resumeUpload(storedName: string, bytes: Buffer, contentType = ""): { name: string; mime: string } {
  const name = (storedName.split("/").pop() || "resume").split("?")[0] || "resume"
  const head = bytes.subarray(0, 8).toString("latin1")
  const type = TYPES.find((t) => head.startsWith(t.magic))
  if (type) {
    const hasExt = name.toLowerCase().endsWith(`.${type.ext}`)
    return { name: hasExt ? name : `${name}.${type.ext}`, mime: type.mime }
  }
  // Unrecognised bytes: keep what we were told, and give forms an extension they accept.
  return {
    name: /\.(pdf|docx?|rtf|txt)$/i.test(name) ? name : `${name}.pdf`,
    mime: contentType && !/text\/plain/i.test(contentType) ? contentType : "application/pdf",
  }
}
