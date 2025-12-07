// src/app/[slug]/page.tsx
'use client';

import { useEffect, useState, use } from 'react';
import { getPageDataBySlug, PageData, LinkData, incrementLinkClick, generateVCardBlob } from "@/lib/pageService";
import { notFound } from "next/navigation";
import Image from 'next/image';
import Link from 'next/link';
import { FaGithub, FaInstagram, FaLinkedin, FaGlobe, FaTwitter, FaFacebook, FaYoutube, FaTiktok, FaWhatsapp, FaEnvelope, FaLink, FaCheckCircle, FaUserPlus } from 'react-icons/fa';
import { motion, Variants } from 'framer-motion';

const iconMap: { [key: string]: React.ElementType } = {
  github: FaGithub,
  instagram: FaInstagram,
  linkedin: FaLinkedin,
  globe: FaGlobe,
  website: FaGlobe,
  twitter: FaTwitter,
  facebook: FaFacebook,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  whatsapp: FaWhatsapp,
  email: FaEnvelope,
  link: FaLink,
};

// Estende o tipo PageData para incluir a imagem de fundo
interface ExtendedPageData extends PageData {
  backgroundImage?: string;
}

export default function UserPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const [pageData, setPageData] = useState<ExtendedPageData | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      const data = await getPageDataBySlug(resolvedParams.slug) as ExtendedPageData | null;
      if (!isMounted) return;

      if (!data) {
        notFound();
      } else {
        setPageData(data);
        document.documentElement.className = "";

        const theme = data.theme || 'light';

        if (data.backgroundImage) {
          document.documentElement.classList.add('theme-custom-image');
        } else {
          document.documentElement.classList.add(`theme-${theme}`);
        }
      }
    };
    fetchData();
    return () => { isMounted = false; document.documentElement.className = ""; };
  }, [resolvedParams.slug]);

  useEffect(() => {
    setTimeout(() => setIsLoaded(true), 100);
  }, [pageData]);

  const handleLinkClick = (link: LinkData) => {
    incrementLinkClick(resolvedParams.slug, link.url);
  };

  const handleSaveContact = () => {
    if (!pageData) return;
    const blob = generateVCardBlob(pageData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pageData.title.replace(/\s+/g, '_')}_contato.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!pageData) return <div className="flex justify-center items-center min-h-screen"><p className="animate-pulse">Carregando...</p></div>;

  const isProTheme = ['realtor', 'restaurant', 'mechanic', 'influencer', 'ocean', 'sunset', 'forest', 'bubblegum', 'developer'].includes(pageData.theme || '') || !!pageData.backgroundImage;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 12
      }
    }
  };

  return (
    <div
      className="min-h-screen font-sans transition-all duration-300 text-theme-text bg-theme-bg"
      style={pageData.backgroundImage ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.8)), url(${pageData.backgroundImage})` } : {}}
    >
      <main className="container mx-auto max-w-xl px-4 py-12 md:py-20">

        <div className={`flex flex-col items-center text-center mb-10 transition-all duration-700 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {pageData.profileImageUrl && (
            <div className="relative group">
              <Image
                src={pageData.profileImageUrl}
                alt={pageData.title}
                width={120} height={120}
                className="rounded-full border-4 border-theme-image-border shadow-2xl object-cover w-32 h-32"
                priority
              />
              {isProTheme && (
                <div className="absolute bottom-1 right-1 bg-blue-500 text-white rounded-full p-1.5 border-2 border-white shadow-sm" title="Verificado / Pro">
                  <FaCheckCircle size={14} />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 justify-center mt-4">
            <h1 className="text-2xl md:text-3xl font-bold text-theme-text drop-shadow-md">
              {pageData.title}
            </h1>
            {isProTheme && <FaCheckCircle className="text-blue-500 ml-1" size={20} title="Pro" />}
          </div>

          <p className="mt-2 text-sm md:text-base text-theme-text-muted max-w-xs mx-auto leading-relaxed opacity-90">
            {pageData.bio}
          </p>

          <button 
            onClick={handleSaveContact}
            className="mt-6 flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 text-theme-text px-4 py-2 rounded-full text-sm font-medium hover:bg-white/20 transition-all shadow-sm"
          >
             <FaUserPlus /> Salvar na Agenda
          </button>
        </div>

        <motion.div
          className="space-y-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {pageData.links?.map((link, index) => {
            const iconKey = link.icon?.toLowerCase();
            const IconComponent = iconKey ? (iconMap[iconKey] || FaLink) : null;
            return (
              <motion.a
                key={index}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleLinkClick(link)}
                variants={itemVariants}
                whileHover={{ scale: 1.02, translateY: -2 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center p-4 rounded-xl border border-white/10
                  bg-theme-button-bg text-theme-button-text hover:bg-theme-button-hover-bg shadow-sm hover:shadow-lg`}
                style={{ backdropFilter: 'blur(5px)' }}
              >
                {IconComponent && (
                  <span className="mr-4 text-xl opacity-80">
                    <IconComponent />
                  </span>
                )}
                <span className="font-medium grow text-center pr-6">{link.title}</span>
              </motion.a>
            );
          })}
        </motion.div>

        <footer className="mt-16 text-center">
          <Link href="/" className="inline-block px-4 py-2 rounded-full bg-black/20 backdrop-blur-sm text-xs text-white/70 hover:bg-black/40 transition-colors">
            Criado com <strong>Meus Links Pro</strong>
          </Link>
        </footer>

      </main>
    </div>
  );
}