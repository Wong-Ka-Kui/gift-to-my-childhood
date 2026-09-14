export type GuestProfile = {
  id: string;
  name: string;
  avatar: string;
  createdAt: number;
};

export function normalizeGuestName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 24 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("请输入 1–24 个字符的名字。");
  }
  return name;
}

export function validateGuestAvatar(value: string): string {
  if (value.length > 250_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("头像未生成成功，请重新尝试。");
  }
  return value;
}
