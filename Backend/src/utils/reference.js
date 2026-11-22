/**
 * Sequential reference numbers (SH-2026-00001, CMP-2026-0001).
 * Derived from the highest number already issued, not from a row count, so deletions
 * cannot cause reuse. createWithReference retries when two requests pick the same number.
 */
async function nextReference(delegate, field, prefix, width, skip = 0) {
  const last = await delegate.findFirst({
    where: { [field]: { startsWith: prefix } },
    orderBy: { [field]: 'desc' },
    select: { [field]: true },
  });
  const lastNumber = last ? parseInt(String(last[field]).slice(prefix.length), 10) : 0;
  const next = (Number.isNaN(lastNumber) ? 0 : lastNumber) + 1 + skip;
  return `${prefix}${String(next).padStart(width, '0')}`;
}

async function createWithReference(delegate, { field, prefix, width, data }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = await nextReference(delegate, field, prefix, width, attempt);
    try {
      return await delegate.create({ data: { ...data, [field]: reference } });
    } catch (error) {
      if (error.code === 'P2002' && JSON.stringify(error.meta || {}).includes(field)) continue;
      throw error;
    }
  }
  throw new Error(`Could not allocate a unique ${field} after 5 attempts`);
}

module.exports = { nextReference, createWithReference };
