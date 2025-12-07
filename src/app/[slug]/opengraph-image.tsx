// src/app/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og';
import { getPageDataBySlug, PageData } from '@/lib/pageService';

export const runtime = 'edge';

export const alt = 'Meus Links Pro - Perfil';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const { slug } = await params; // Await params (Next.js 15 requirement)
  const pageData = await getPageDataBySlug(slug) as PageData | null;

  const title = pageData?.title || 'Meus Links Pro';
  const bio = pageData?.bio || 'Confira meus links!';
  const profileImage = pageData?.profileImageUrl;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          backgroundImage: 'linear-gradient(to bottom right, #2563eb, #1e40af)',
          color: 'white',
          fontFamily: 'sans-serif',
          textAlign: 'center',
          padding: '40px',
        }}
      >
        {profileImage && (
          <img
            src={profileImage}
            alt={title}
            width="150"
            height="150"
            style={{
              borderRadius: '50%',
              border: '6px solid white',
              objectFit: 'cover',
              marginBottom: '30px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
            }}
          />
        )}
        <div style={{ fontSize: 60, fontWeight: 'bold', marginBottom: '10px' }}>
          {title}
        </div>
        <div style={{ fontSize: 30, opacity: 0.9, maxWidth: '800px', lineHeight: 1.4 }}>
          {bio.length > 100 ? bio.substring(0, 100) + '...' : bio}
        </div>
        <div style={{ 
            marginTop: '40px', 
            background: 'rgba(255,255,255,0.2)', 
            padding: '10px 30px', 
            borderRadius: '50px',
            fontSize: 20
        }}>
            meuslinkspro.com/{slug}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}