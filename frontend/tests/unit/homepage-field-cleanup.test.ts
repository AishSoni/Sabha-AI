import { describe, expect, it, vi } from "vitest";

import {
  releaseFieldResources,
  type FieldResources,
} from "@/features/homepage/ui/home-field-webgl";

function fakeGl() {
  return {
    deleteTexture: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteVertexArray: vi.fn(),
    deleteProgram: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

function completeResources(): FieldResources {
  return {
    program: {} as WebGLProgram,
    vertexArray: {} as WebGLVertexArrayObject,
    quadBuffer: {} as WebGLBuffer,
    instanceBuffer: {} as WebGLBuffer,
    glyphs: {} as WebGLTexture,
  };
}

describe("homepage field resources", () => {
  it("releases every allocated resource once", () => {
    const gl = fakeGl();
    const resources = completeResources();
    const { program, vertexArray, quadBuffer, instanceBuffer, glyphs } =
      resources;

    releaseFieldResources(gl, resources);

    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteTexture).toHaveBeenCalledWith(glyphs);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
    expect(gl.deleteBuffer).toHaveBeenCalledWith(quadBuffer);
    expect(gl.deleteBuffer).toHaveBeenCalledWith(instanceBuffer);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(gl.deleteVertexArray).toHaveBeenCalledWith(vertexArray);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledWith(program);
    expect(resources).toEqual({
      program: null,
      vertexArray: null,
      quadBuffer: null,
      instanceBuffer: null,
      glyphs: null,
    });
  });

  it("is safe to run again after cleanup", () => {
    const gl = fakeGl();
    const resources = completeResources();

    releaseFieldResources(gl, resources);
    releaseFieldResources(gl, resources);

    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  });

  it("only releases the resources that were actually allocated", () => {
    const gl = fakeGl();
    const resources: FieldResources = {
      program: {} as WebGLProgram,
      vertexArray: null,
      quadBuffer: null,
      instanceBuffer: null,
      glyphs: null,
    };

    releaseFieldResources(gl, resources);

    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteTexture).not.toHaveBeenCalled();
    expect(gl.deleteBuffer).not.toHaveBeenCalled();
    expect(gl.deleteVertexArray).not.toHaveBeenCalled();
  });
});
