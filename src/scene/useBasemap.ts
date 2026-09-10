/*
 * Fetching the map image, and doing without it.
 *
 * WHY IT IS ALLOWED TO FAIL SILENTLY
 *   Every other layer read from outside works this way — a missing park layer
 *   is not worth an error in front of anyone — and the map has one more way
 *   to go wrong than the rest: it is the only thing in the app that depends
 *   on a third party still being there. A token that has been rotated, a
 *   month's quota spent, an aeroplane. In all of them the city should keep
 *   standing on the plain ground it stood on before, which is exactly what
 *   returning null does.
 *
 *   That matters more than it looks, because a frozen release cannot be
 *   rebuilt. mycitytwin.com/ver-1/ has to keep working in week 12, and it
 *   will — just without its map.
 *
 * THE TOKEN
 *   Handed in rather than read from the bundle — see data/mapboxConfig.ts,
 *   which explains why it is fetched at run time and not compiled in. Null
 *   config means no token was deployed, which is the ordinary state for
 *   anyone who clones this and runs it: no request, no map, nothing else
 *   changed.
 */

import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { SRGBColorSpace, TextureLoader, type Texture } from 'three';
import type { MapboxConfig } from '../data/mapboxConfig';
import { staticImageUrl, type ImagePlacement } from './basemap';

export function useBasemapTexture(
  placement: ImagePlacement | null,
  config: MapboxConfig | null,
): Texture | null {
  /*
   * Anisotropy, and why it is not optional here. This texture is on the
   * ground, and the camera spends most of its time low and looking across it.
   * At that angle a texel covers a long thin sliver of screen, and without
   * anisotropic filtering the far half of the city turns to grey mush.
   */
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());

  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    if (!config || !placement) return;

    let live = true;
    let loaded: Texture | null = null;

    new TextureLoader().load(
      staticImageUrl(placement, config.style, config.token),
      (result) => {
        // Arriving after the component went away: nothing wants it, and a
        // texture that is never disposed holds its pixels on the GPU.
        if (!live) {
          result.dispose();
          return;
        }
        // Without this the map comes back washed out. The image is sRGB and
        // three.js assumes linear unless told, which looks like a Mapbox
        // style problem rather than a colour-space one.
        result.colorSpace = SRGBColorSpace;
        result.anisotropy = maxAnisotropy;
        loaded = result;
        setTexture(result);
      },
      undefined,
      (error) => {
        // Silent in the scene, by the argument above — but not silent here.
        // A rotated token, a spent quota and a typo in the style name all
        // present as a ground that simply stays plain, and without this the
        // only way to tell them apart is to read the network tab.
        console.warn('Basemap unavailable; the city keeps its plain ground.', error);
      },
    );

    return () => {
      live = false;
      loaded?.dispose();
    };
  }, [placement, config, maxAnisotropy]);

  return texture;
}
