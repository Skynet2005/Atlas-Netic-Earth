import { ImageResponse } from 'next/og';

export const alt = 'Atlas-Netic live 3D Earth intelligence';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const EARTH_IMAGE = 'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/solar/2023/09/p/i/a/1/PIA18033.jpg?crop=faces%2Cfocalpoint&fit=clip&h=1200&w=1200';

export default function Image() {
  return new ImageResponse(
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(125deg,#02070c 0%,#041019 48%,#02070c 100%)',
      color: '#eef8fb',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{
        position: 'absolute',
        right: -8,
        top: -14,
        width: 620,
        height: 620,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <img
          src={EARTH_IMAGE}
          width="590"
          height="590"
          alt=""
          style={{
            width: 590,
            height: 590,
            objectFit: 'contain',
            filter: 'saturate(1.02) contrast(1.04)',
          }}
        />
      </div>
      <div style={{
        position: 'absolute',
        right: 35,
        bottom: 24,
        fontSize: 12,
        letterSpacing: 1.5,
        color: '#64818d',
      }}>EARTH IMAGE · NASA / SUOMI NPP</div>
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', padding:'74px 70px', width:650, zIndex:2 }}>
        <div style={{ fontSize:21, letterSpacing:7, color:'#9de6da', marginBottom:20 }}>EARTH INTELLIGENCE</div>
        <div style={{ fontSize:75, fontWeight:700, letterSpacing:-4, lineHeight:1 }}>Atlas-Netic</div>
        <div style={{ fontSize:28, lineHeight:1.35, color:'#c0d5df', marginTop:24, maxWidth:560 }}>
          Live 3D terrain, aircraft, ships, satellites, earthquakes, fires and weather in one interactive globe.
        </div>
        <div style={{ display:'flex', gap:12, marginTop:34, fontSize:16, color:'#8fb3c1' }}>
          <span>LIVE DATA</span><span>•</span><span>3D EARTH</span><span>•</span><span>PUBLIC SOURCES</span>
        </div>
      </div>
    </div>,
    size,
  );
}
