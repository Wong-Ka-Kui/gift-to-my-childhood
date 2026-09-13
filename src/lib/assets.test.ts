import { describe, expect, it } from "vitest";
import { readDocument, resolveResource, validateFiles } from "./assets";
const file = (name: string, text = "abc") => ({ name, blob: new Blob([text]) });
describe("model import boundary", () => {
  it("accepts one model and local dependencies", () =>
    expect(validateFiles([file("pet.gltf"), file("pet.bin")]).main).toBe(
      "pet.gltf",
    ));
  it("rejects ambiguous model selection and duplicate files", () => {
    expect(() => validateFiles([file("a.glb"), file("b.glb")])).toThrow("每次");
    expect(() => validateFiles([file("a.glb"), file("a.glb")])).toThrow("同名");
  });
  it("rejects unsupported formats and oversized packages", () => {
    expect(() => validateFiles([file("a.fbx")])).toThrow();
    expect(() =>
      validateFiles([
        { name: "a.glb", blob: { size: 100 * 1024 * 1024 + 1 } as Blob },
      ]),
    ).toThrow("100 MB");
  });
  it("resolves encoded texture paths from multi-selection", () => {
    const texture = file("pet skin.png");
    expect(resolveResource("textures/pet%20skin.png", [texture])).toBe(texture);
  });
  it("rejects missing files and network dependencies", () => {
    expect(() => resolveResource("missing.bin", [])).toThrow("缺少");
    expect(() => resolveResource("https://example.org/skin.png", [])).toThrow(
      "外部",
    );
    expect(() => resolveResource("//example.org/skin.png", [])).toThrow("外部");
  });
  it("reads embedded glTF and rejects corrupt GLB", async () => {
    expect(
      (await readDocument(new Blob(['{"asset":{"version":"2.0"}}']))).json.asset
        .version,
    ).toBe("2.0");
    const bytes = new Uint32Array([0x46546c67, 2, 999, 4, 0x4e4f534a]);
    await expect(readDocument(new Blob([bytes]))).rejects.toThrow("文件头");
  });
});
