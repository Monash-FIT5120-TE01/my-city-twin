/*
 * Diagonal stripes on a standard material, in world space: the colour-blind friendly mark of a project
 * under construction (palette.ts), so that it is told from the buildings around it by pattern as well as
 * by colour. Every other band of STRIPE_M metres is darkened; the bands run across the building's faces
 * whichever way they point, because they follow x + y + z in the world.
 */
import type { WebGLProgramParametersWithUniforms } from 'three';

/** The width of one band, metres: read as stripes from a street away and from over the city. */
const STRIPE_M = 7;
/** How dark the darker band is, as a share of the colour (0.55: the yellow #f2c14e goes to about L* 60). */
const STRIPE_SHADE = 0.55;

export function addStripes(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader =
    'varying vec3 vStripeWorld;\n' +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vStripeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
  shader.fragmentShader =
    'varying vec3 vStripeWorld;\n' +
    shader.fragmentShader.replace(
      '#include <color_fragment>',
      [
        '#include <color_fragment>',
        `  float stripeBand = step(0.5, fract((vStripeWorld.x + vStripeWorld.y + vStripeWorld.z) / ${(STRIPE_M * 2).toFixed(1)}));`,
        `  diffuseColor.rgb *= mix(1.0, ${STRIPE_SHADE.toFixed(2)}, stripeBand);`,
      ].join('\n'),
    );
}

/** So the striped program is not shared with a plain one (three caches programs by this). */
export const stripesCacheKey = () => 'stripes';
