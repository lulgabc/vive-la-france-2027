export function avatarSrcSet(path: string): string {
  if (!path) return '';
  return `${path} 512w, ${path.replace('/avatars/', '/avatars/128/')} 128w, ${path.replace('/avatars/', '/avatars/64/')} 64w`;
}
