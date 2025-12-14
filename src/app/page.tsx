// src/app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  FaUtensils, FaWhatsapp, FaQrcode, FaBolt, FaCheck, FaArrowRight, FaStore, FaTicketAlt, FaRocket, FaHeadset, FaBan 
} from 'react-icons/fa';
import { motion } from 'framer-motion';
import { getRecentPages, PageData } from '@/lib/pageService';
import Image from 'next/image';

export default function LandingPage() {
  const [recentPages, setRecentPages] = useState<PageData[]>([]);
  const [loadingRecents, setLoadingRecents] = useState(true);

  // SEU NÚMERO DO WHATSAPP PARA VENDAS DO PLANO VIP
  const SALES_WHATSAPP = "5579996337995"; 

  useEffect(() => {
    const fetchRecents = async () => {
      const pages = await getRecentPages();
      setRecentPages(pages);
      setLoadingRecents(false);
    };
    fetchRecents();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      
      {/* --- NAVBAR --- */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2 text-xl font-extrabold text-gray-800">
            <div className="bg-orange-600 text-white p-2 rounded-lg">
              <FaUtensils size={18} />
            </div>
            Cardápio<span className="text-orange-600">Pro</span>
          </div>
          <div className="flex gap-4">
            <Link href="/admin/login" className="text-sm font-bold text-gray-600 hover:text-orange-600 py-2 transition">
              Área do Cliente
            </Link>
            <Link href="/admin/login" className="bg-gray-900 text-white px-5 py-2 rounded-full text-sm font-bold hover:bg-orange-600 transition shadow-lg hidden sm:block">
              Criar Grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <header className="pt-32 pb-20 px-4 text-center bg-gradient-to-b from-white to-gray-100 overflow-hidden relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-orange-200/20 rounded-full blur-3xl -z-10"></div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto"
        >
          <span className="inline-block py-1 px-3 rounded-full bg-orange-100 text-orange-700 text-xs font-bold uppercase tracking-wider mb-4 border border-orange-200">
            🚀 O Sistema de Delivery Mais Completo
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-6 leading-tight">
            Venda mais com <span className="text-green-500">WhatsApp</span>, <br/>
            <span className="text-blue-600">Pix</span> e <span className="text-purple-600">Cupons</span>.
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed">
            Tenha seu cardápio digital profissional hoje mesmo. Comece grátis e escale seu negócio.
          </p>
          
          <div className="flex flex-col items-center gap-6">
            <Link href="/admin/login" className="w-full sm:w-auto bg-orange-600 text-white px-8 py-4 rounded-xl text-lg font-bold hover:bg-orange-700 transition shadow-xl hover:shadow-orange-500/30 flex items-center justify-center gap-2 transform hover:scale-105">
              Criar Conta Grátis <FaArrowRight size={14}/>
            </Link>

            <div className="w-full max-w-2xl mt-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                    Últimos Restaurantes Cadastrados 👇
                </p>
                
                {loadingRecents ? (
                    <div className="flex justify-center gap-3 animate-pulse">
                        <div className="h-10 w-32 bg-gray-200 rounded-full"></div>
                        <div className="h-10 w-32 bg-gray-200 rounded-full"></div>
                    </div>
                ) : (
                    <div className="flex flex-wrap justify-center gap-3">
                        {recentPages.length > 0 ? (
                            recentPages.map((page) => (
                                <Link 
                                    key={page.slug} 
                                    href={`/${page.slug}`} 
                                    target="_blank"
                                    className="bg-white border border-gray-200 hover:border-orange-400 text-gray-700 px-4 py-2 rounded-full text-sm font-bold shadow-sm hover:shadow-md transition flex items-center gap-2 group"
                                >
                                    {page.profileImageUrl ? (
                                        <div className="w-5 h-5 rounded-full overflow-hidden relative">
                                            <Image src={page.profileImageUrl} alt="Icon" fill className="object-cover" sizes="20px" />
                                        </div>
                                    ) : (
                                        <FaStore className="text-gray-400 group-hover:text-orange-500" />
                                    )}
                                    {page.title.length > 15 ? page.title.substring(0, 15) + '...' : page.title}
                                </Link>
                            ))
                        ) : (
                            <Link href="/admin/login" className="bg-white border border-gray-300 text-gray-600 px-5 py-2 rounded-full text-sm font-bold hover:bg-gray-50 flex items-center gap-2">
                                <FaStore className="text-orange-500" /> Seja o primeiro a criar!
                            </Link>
                        )}
                    </div>
                )}
            </div>
          </div>
        </motion.div>
      </header>

      {/* --- VITRINE DE RECURSOS --- */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">Tudo que você precisa para vender mais</h2>
            <p className="text-gray-500">Esqueça os PDFs. Tenha um sistema profissional.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:border-green-200 transition group">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4 text-green-600"><FaWhatsapp size={24} /></div>
              <h3 className="text-lg font-bold mb-2">Pedidos no Zap</h3>
              <p className="text-sm text-gray-600">O pedido chega formatado e calculado. Zero erros de comunicação.</p>
            </div>

            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:border-blue-200 transition group">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 text-blue-600"><FaQrcode size={24} /></div>
              <h3 className="text-lg font-bold mb-2">Pix Automático</h3>
              <p className="text-sm text-gray-600">QR Code na hora. Receba direto na sua conta, sem taxas.</p>
            </div>

            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:border-purple-200 transition group">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4 text-purple-600"><FaTicketAlt size={24} /></div>
              <h3 className="text-lg font-bold mb-2">Cupons</h3>
              <p className="text-sm text-gray-600">Crie campanhas como "VIP10" e fidelize seus clientes.</p>
            </div>

            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:border-orange-200 transition group">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4 text-orange-600"><FaRocket size={24} /></div>
              <h3 className="text-lg font-bold mb-2">Alta Performance</h3>
              <p className="text-sm text-gray-600">Cardápio que carrega em milissegundos e não trava.</p>
            </div>
          </div>
        </div>
      </section>

      {/* --- TABELA DE PREÇOS (3 OPÇÕES) --- */}
      <section className="py-20 px-4 bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Escolha o plano ideal</h2>
            <p className="text-gray-400">Comece pequeno e cresça rápido.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-center">
            
            {/* 1. PLANO GRÁTIS */}
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 h-fit">
              <h3 className="text-lg font-bold text-gray-400 mb-2">Iniciante</h3>
              <div className="text-3xl font-extrabold mb-4">Grátis <span className="text-xs font-normal text-gray-500">/sempre</span></div>
              <p className="text-xs text-gray-400 mb-6">Ideal para testar e validar seu negócio.</p>
              
              <ul className="space-y-3 mb-8 text-sm text-gray-300">
                <li className="flex gap-2"><FaCheck className="text-green-500 shrink-0 mt-0.5"/> <strong>8 Produtos</strong></li>
                <li className="flex gap-2"><FaCheck className="text-green-500 shrink-0 mt-0.5"/> Pedidos no WhatsApp</li>
                <li className="flex gap-2 opacity-50"><FaBan className="text-gray-500 shrink-0 mt-0.5"/> Sem Pix Automático</li>
                <li className="flex gap-2 opacity-50"><FaBan className="text-gray-500 shrink-0 mt-0.5"/> Sem Cupons</li>
              </ul>
              <Link href="/admin/login" className="block w-full py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-center transition text-sm">
                Criar Grátis
              </Link>
            </div>

            {/* 2. PLANO PRO (MENSAL) - DESTAQUE */}
            <div className="bg-orange-600 p-8 rounded-3xl border-4 border-orange-500 shadow-2xl relative transform scale-105 z-10">
              <div className="absolute top-0 right-0 bg-yellow-400 text-black text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl uppercase">Mais Popular</div>
              <h3 className="text-xl font-bold text-orange-100 mb-2">Profissional</h3>
              <div className="text-4xl font-extrabold mb-4">R$ 29,90 <span className="text-sm font-normal text-orange-200">/mês</span></div>
              <p className="text-xs text-orange-200 mb-6">Liberdade total para vender sem limites.</p>

              <ul className="space-y-3 mb-8 text-white font-medium text-sm">
                <li className="flex gap-2"><FaCheck className="text-yellow-300 shrink-0 mt-0.5"/> <strong>Produtos Ilimitados</strong></li>
                <li className="flex gap-2"><FaCheck className="text-yellow-300 shrink-0 mt-0.5"/> <strong>Pix Automático</strong> (QR Code)</li>
                <li className="flex gap-2"><FaCheck className="text-yellow-300 shrink-0 mt-0.5"/> <strong>Cupons de Desconto</strong></li>
                <li className="flex gap-2"><FaCheck className="text-yellow-300 shrink-0 mt-0.5"/> Temas Premium</li>
                <li className="flex gap-2"><FaCheck className="text-yellow-300 shrink-0 mt-0.5"/> Capa Personalizada</li>
              </ul>
              <Link href="/admin/login" className="block w-full py-3 rounded-xl bg-white text-orange-600 hover:bg-gray-100 font-bold text-center transition shadow-lg">
                Testar 7 Dias Grátis
              </Link>
            </div>

            {/* 3. PLANO VIP (SETUP 200) */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 p-6 rounded-2xl border border-purple-500/50 h-fit relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500 to-blue-500"></div>
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><FaRocket className="text-purple-400"/> VIP Setup</h3>
              <div className="text-3xl font-extrabold mb-1">R$ 200,00</div>
              <p className="text-xs text-purple-300 mb-4 font-bold">Taxa Única + R$ 29,90/mês</p>
              <p className="text-xs text-gray-400 mb-6 border-l-2 border-purple-500 pl-3">
                Sem tempo? Nossa equipe cadastra e configura tudo para você em 24h.
              </p>

              <ul className="space-y-3 mb-8 text-sm text-gray-300">
                <li className="flex gap-2"><FaCheck className="text-purple-400 shrink-0 mt-0.5"/> <strong>Nós cadastramos tudo</strong></li>
                <li className="flex gap-2"><FaCheck className="text-purple-400 shrink-0 mt-0.5"/> Design de Capa Profissional</li>
                <li className="flex gap-2"><FaCheck className="text-purple-400 shrink-0 mt-0.5"/> Consultoria de Cardápio</li>
                <li className="flex gap-2"><FaCheck className="text-purple-400 shrink-0 mt-0.5"/> Suporte VIP no WhatsApp</li>
              </ul>
              
              <a 
                href={`https://wa.me/${SALES_WHATSAPP}?text=Olá! Quero contratar o Setup VIP de 200 reais para meu restaurante.`}
                target="_blank"
                className="block w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-center transition flex items-center justify-center gap-2 text-sm"
              >
                <FaHeadset /> Quero Receber Pronto
              </a>
            </div>

          </div>
        </div>
      </section>

      <section className="py-24 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-6">Pronto para digitalizar seu delivery?</h2>
          <p className="text-gray-600 text-lg mb-8">Junte-se a centenas de restaurantes que modernizaram o atendimento.</p>
          <Link href="/admin/login" className="inline-flex items-center gap-2 bg-green-600 text-white px-10 py-5 rounded-full text-xl font-bold hover:bg-green-700 transition shadow-xl hover:shadow-green-500/40">
            <FaWhatsapp /> Criar Meu Cardápio Agora
          </Link>
        </div>
      </section>

      <footer className="bg-white border-t border-gray-100 py-10 px-4 text-center">
        <div className="flex items-center justify-center gap-2 text-xl font-bold text-gray-800 mb-4">
          <FaUtensils className="text-orange-600" /> CardápioPro
        </div>
        <p className="text-gray-500 text-sm">© 2025 CardápioPro. Feito com ❤️ para empreendedores.</p>
      </footer>

    </div>
  );
}