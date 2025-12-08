// src/app/[slug]/page.tsx
'use client';

import { useEffect, useState, use } from 'react';
import { getPageDataBySlug, PageData, LinkData, incrementLinkClick } from "@/lib/pageService";
import { notFound } from "next/navigation";
import Image from 'next/image';
import Link from 'next/link';
import { FaMapMarkerAlt, FaClock, FaPhone, FaWhatsapp, FaUtensils } from 'react-icons/fa';
import { motion, Variants } from 'framer-motion';

interface ExtendedPageData extends PageData {
  backgroundImage?: string;
}

export default function UserPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const [pageData, setPageData] = useState<ExtendedPageData | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      const data = await getPageDataBySlug(resolvedParams.slug) as ExtendedPageData | null;
      if (!data) { notFound(); } 
      else {
        setPageData(data);
        document.documentElement.className = ""; // Reset
        if (data.backgroundImage) {
            document.documentElement.classList.add('theme-custom-image');
        } else {
            // Se não tiver tema definido, usa um padrão de restaurante escuro ou claro
            document.documentElement.classList.add(`theme-${data.theme || 'restaurant'}`);
        }
      }
    };
    fetchData();
    return () => { document.documentElement.className = ""; };
  }, [resolvedParams.slug]);

  const handleItemClick = (link: LinkData) => {
    incrementLinkClick(resolvedParams.slug, link.title); // Usa o título como ID de clique para pratos
  };

  if (!pageData) return <div className="flex justify-center items-center min-h-screen bg-neutral-900 text-white"><p className="animate-pulse">Carregando Cardápio...</p></div>;

  // Variantes de Animação
  const container = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemAnim = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  return (
    <div className="min-h-screen font-sans text-theme-text bg-theme-bg pb-20 transition-colors duration-500"
         style={pageData.backgroundImage ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.8)), url(${pageData.backgroundImage})`, backgroundSize: 'cover', backgroundAttachment: 'fixed' } : {}}
    >
      {/* CABEÇALHO DO CARDÁPIO */}
      <header className="relative pt-12 pb-8 px-4 text-center">
        <div className="relative inline-block mb-4">
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl mx-auto relative bg-neutral-800">
                {pageData.profileImageUrl ? (
                    <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-white/20"><FaUtensils/></div>
                )}
            </div>
        </div>
        
        <h1 className="text-3xl md:text-4xl font-extrabold mb-2 drop-shadow-lg tracking-tight">{pageData.title}</h1>
        <p className="text-white/80 max-w-md mx-auto text-sm md:text-base leading-relaxed">{pageData.bio}</p>

        {/* Botões de Ação Rápida (Fixo para Restaurantes) */}
        <div className="flex justify-center gap-4 mt-6">
            <a href="#" className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg transition transform hover:scale-105">
                <FaWhatsapp size={18} /> Pedir no Zap
            </a>
            <button className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition">
                <FaMapMarkerAlt /> Localização
            </button>
        </div>
      </header>

      {/* LISTA DE PRATOS */}
      <main className="container mx-auto max-w-2xl px-4">
        <div className="flex items-center gap-4 mb-6">
            <div className="h-px bg-white/20 flex-1"></div>
            <span className="text-xs font-bold uppercase tracking-widest opacity-50">Cardápio</span>
            <div className="h-px bg-white/20 flex-1"></div>
        </div>

        <motion.div variants={container} initial="hidden" animate="visible" className="space-y-4">
          {pageData.links?.map((item, index) => (
            <motion.div
              key={index}
              variants={itemAnim}
              onClick={() => handleItemClick(item)}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-colors cursor-pointer group"
            >
              <div className="flex">
                {/* Imagem do Prato */}
                {item.imageUrl && (
                    <div className="w-32 sm:w-40 relative shrink-0">
                        <Image src={item.imageUrl} alt={item.title} fill className="object-cover" />
                    </div>
                )}
                
                {/* Detalhes */}
                <div className="p-4 flex-1 flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-lg leading-tight group-hover:text-orange-400 transition-colors">{item.title}</h3>
                        {item.price && (
                            <span className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded ml-2 shadow-sm shrink-0">
                                R$ {item.price}
                            </span>
                        )}
                    </div>
                    
                    {item.description && (
                        <p className="text-sm text-white/60 line-clamp-2 leading-relaxed mb-2">{item.description}</p>
                    )}
                    
                    {/* Tags ou Botão de Ação */}
                    <div className="mt-auto pt-2 border-t border-white/5 flex justify-end">
                        <span className="text-xs text-orange-400 font-medium uppercase tracking-wide flex items-center gap-1">
                            Adicionar <FaPlus size={10}/>
                        </span>
                    </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </main>

      <footer className="mt-20 text-center opacity-40 text-xs">
          <p>Cardápio Digital por <strong>Meus Links Pro</strong></p>
      </footer>
    </div>
  );
}

// Ícone auxiliar
function FaPlus(props: any) { return <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" {...props}><path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"></path></svg>; }