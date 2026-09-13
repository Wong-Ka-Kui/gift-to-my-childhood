import type { ModelAsset } from "./assets";

export const MAX_PETS = 3;

export type PetProfile = {
  name: string;
  gender: string;
  mbti: string;
  age: string;
  introduction: string;
  facingYaw: number;
};

export type PetRecord = {
  id: string;
  asset: ModelAsset;
  profile: PetProfile;
};
