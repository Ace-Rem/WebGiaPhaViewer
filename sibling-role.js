export function normalizeFamilyRole(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '-');
  if (['biological', 'blood', 'child', 'con-ruot', 'conruot', 'ruot', 'false'].includes(normalized)) return 'biological';
  if (['inlaw', 'in-law', 'daughter-in-law', 'son-in-law', 'con-dau', 'con-re', 'true'].includes(normalized)) return 'inLaw';
  return null;
}

export function familyParentPairKey(member) {
  if (!member?.fatherId || !member?.motherId) return null;
  return `${member.fatherId}\u0000${member.motherId}`;
}

function hasSpouseLink(left, right) {
  return (left?.spouseIds || []).includes(right?.id) || (right?.spouseIds || []).includes(left?.id);
}

export function resolveFamilyRoles(members = []) {
  const list = Array.isArray(members) ? members.filter((member) => member && typeof member === 'object' && member.id) : [];
  const roles = new Map();
  const explicitIds = new Set();
  const groups = new Map();
  list.forEach((member) => {
    const explicitRole = normalizeFamilyRole(member.familyRole);
    if (explicitRole) {
      roles.set(member.id, explicitRole);
      explicitIds.add(member.id);
    }
    const groupKey = familyParentPairKey(member);
    if (groupKey) {
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(member);
    }
  });

  const ambiguousIds = new Set();
  groups.forEach((group) => {
    group.forEach((candidate) => {
      if (explicitIds.has(candidate.id) || candidate.siblingOrder !== 1) return;
      const spouseMembers = group.filter((other) => other.id !== candidate.id && hasSpouseLink(candidate, other));
      if (spouseMembers.some((other) => Number.isInteger(other.siblingOrder) && other.siblingOrder > 1)) {
        roles.set(candidate.id, 'inLaw');
      } else if (spouseMembers.some((other) => other.siblingOrder === 1)) {
        ambiguousIds.add(candidate.id);
      }
    });
  });

  ambiguousIds.forEach((id) => {
    if (!roles.has(id)) roles.set(id, 'ambiguous');
  });
  list.forEach((member) => {
    if (!roles.has(member.id)) roles.set(member.id, 'biological');
  });
  return { byId: roles, ambiguousIds };
}

export function resolvedFamilyRole(member, resolution) {
  return resolution?.byId?.get(member?.id) || normalizeFamilyRole(member?.familyRole) || 'biological';
}

export function isInLawMember(member, resolution) {
  return resolvedFamilyRole(member, resolution) === 'inLaw';
}

export function isBiologicalMember(member, resolution) {
  return resolvedFamilyRole(member, resolution) === 'biological';
}

function normalizeFamilySurname(value) {
  return String(value ?? '').normalize('NFC').trim().split(/\s+/).filter(Boolean)[0] || '';
}

export function getFamilySurname(family = {}) {
  const rawName = String(family.name || '').normalize('NFC').trim();
  if (!rawName) return '';
  const afterFamilyMarker = rawName.match(/\bhọ\s+(.+)$/iu)?.[1] || rawName;
  return normalizeFamilySurname(afterFamilyMarker);
}

export function getMemberSurname(member = {}) {
  return normalizeFamilySurname(member.fullName);
}

export function isInFamily(member, family = {}) {
  const familySurname = getFamilySurname(family);
  const memberSurname = getMemberSurname(member);
  if (!familySurname || !memberSurname) return false;
  return memberSurname.toLocaleLowerCase('vi-VN') === familySurname.toLocaleLowerCase('vi-VN');
}
