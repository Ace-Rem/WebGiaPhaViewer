function stripVietnameseMarks(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function getMemberImageFilename(member) {
  const fullName = typeof member?.fullName === 'string' ? member.fullName.trim() : '';
  const birthYear = typeof member?.birthDate === 'string' ? member.birthDate.match(/^(\d{4})(?:-|$)/)?.[1] : null;
  if (!fullName || !birthYear) return null;
  const normalizedName = stripVietnameseMarks(fullName).toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
  return normalizedName ? `${normalizedName}${birthYear}.webp` : null;
}

export function getMemberImagePath(member) {
  const filename = getMemberImageFilename(member);
  return filename ? `./assets/members/${filename}` : null;
}
