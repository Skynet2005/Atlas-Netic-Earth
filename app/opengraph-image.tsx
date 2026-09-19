import { ImageResponse } from 'next/og';

export const alt = 'Atlas-Netic live 3D Earth intelligence';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      position: 'relative',
      overflow: 'hidden',
      background: 'radial-gradient(circle at 68% 48%, #174b66 0%, #0a2233 26%, #041019 58%, #010609 100%)',
      color: '#eef8fb',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{
        position: 'absolute',
        width: 520,
        height: 520,
        borderRadius: 999,
        right: 70,
        top: 55,
        background: 'radial-gradient(circle at 36% 30%, #77c6d7 0%, #2b718b 13%, #174961 31%, #092536 59%, #04131d 73%)',
        border: '2px solid rgba(164,236,219,.32)',
        boxShadow: '0 0 80px rgba(71,170,203,.22)',
      }}/>
      <div style={{
        position: 'absolute',
        width: 560,
        height: 560,
        borderRadius: 999,
        right: 50,
        top: 35,
        border: '1px solid rgba(164,236,219,.14)',
      }}/>
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', padding:'76px 72px', width:650, zIndex:2 }}>
        <div style={{ fontSize:22, letterSpacing:7, color:'#9de6da', marginBottom:22 }}>EARTH INTELLIGENCE</div>
        <div style={{ fontSize:76, fontWeight:700, letterSpacing:-4, lineHeight:1 }}>Atlas-Netic</div>
        <div style={{ fontSize:29, lineHeight:1.35, color:'#c0d5df', marginTop:25, maxWidth:590 }}>
          Live 3D terrain, aircraft, ships, satellites, earthquakes, fires and weather in one interactive globe.
        </div>
        <div style={{ display:'flex', gap:12, marginTop:36, fontSize:17, color:'#8fb3c1' }}>
          <span>LIVE DATA</span><span>•</span><span>3D EARTH</span><span>•</span><span>PUBLIC SOURCES</span>
        </div>
      </div>
    </div>,
    size,
  );
}
