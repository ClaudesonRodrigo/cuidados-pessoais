// src/app/page.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  FaCheckCircle, FaRocket, FaMobileAlt, FaPalette, FaChartLine, 
  FaPlay, FaInstagram, FaWhatsapp, FaLinkedin, FaQrcode, FaAddressCard, FaMagic 
} from 'react-icons/fa';

// Componente de Cabeçalho (Header)
const Header = () => (
  <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
    <div className="container mx-auto px-4 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
          M
        </div>
        <span className="text-xl font-bold text-gray-900 tracking-tight">Meus Links Pro</span>
      </div>
      <div className="flex items-center gap-4">
        <Link 
          href="/admin/login" 
          className="text-gray-600 hover:text-blue-600 font-medium transition-colors hidden sm:block"
        >
          Entrar
        </Link>
        <Link 
          href="/admin/login"
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-full font-bold transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 transform hover:-translate-y-0.5"
        >
          Criar Grátis
        </Link>
      </div>
    </div>
  </header>
);

// Componente Hero (Apresentação Principal)
const HeroSection = () => {
  return (
    <section className="pt-32 pb-20 overflow-hidden bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          
          {/* Texto Hero */}
          <div className="lg:w-1/2 text-center lg:text-left z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                Agora com QR Code e vCard!
              </div>
              <h1 className="text-4xl md:text-6xl font-extrabold text-gray-900 leading-[1.15] mb-6">
                Transforme um link em <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">clientes reais.</span>
              </h1>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                A ferramenta definitiva para profissionais. Crie uma página bio, gere QR Codes para sua loja e deixe clientes salvarem seu contato com 1 clique.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link 
                  href="/admin/login"
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-lg px-8 py-4 rounded-xl font-bold transition-all shadow-xl shadow-blue-600/20 hover:shadow-blue-600/40"
                >
                  <FaRocket /> Criar Meu Perfil
                </Link>
                <Link 
                  href="#tutorial"
                  className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-800 text-lg px-8 py-4 rounded-xl font-bold border border-gray-200 transition-all hover:border-gray-300"
                >
                  <FaMagic className="text-purple-500" /> Como Funciona?
                </Link>
              </div>
              
              <div className="mt-8 flex items-center justify-center lg:justify-start gap-4 text-sm text-gray-500">
                <p className="flex items-center gap-1"><FaCheckCircle className="text-green-500"/> App Instalável (PWA)</p>
                <p className="flex items-center gap-1"><FaCheckCircle className="text-green-500"/> Gráficos em Tempo Real</p>
              </div>
            </motion.div>
          </div>

          {/* Mockup do Celular (Visual) */}
          <div className="lg:w-1/2 relative">
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative mx-auto lg:ml-auto w-[300px] h-[600px] bg-gray-900 rounded-[3rem] border-[8px] border-gray-800 shadow-2xl overflow-hidden ring-1 ring-gray-900/5"
            >
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-xl z-20"></div>
              
              <div className="w-full h-full bg-gradient-to-br from-blue-600 to-indigo-800 overflow-y-auto custom-scrollbar relative">
                <div className="pt-16 pb-8 px-6 flex flex-col items-center text-center text-white">
                  <div className="w-24 h-24 rounded-full border-4 border-white/20 shadow-lg bg-white/10 mb-4 overflow-hidden relative">
                     <div className="w-full h-full bg-gray-300 flex items-center justify-center text-3xl font-bold">CS</div>
                  </div>
                  <h3 className="text-xl font-bold mb-1">Carioca Tech</h3>
                  <p className="text-white/80 text-sm mb-6">Soluções Digitais & Software</p>
                  
                  <div className="w-full space-y-3">
                    <div className="w-full bg-white text-blue-900 p-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transform scale-105">
                        <FaWhatsapp size={20} /> Orçamento no Zap
                    </div>
                    {['Meu Portfólio', 'Agendar Consultoria'].map((item, i) => (
                      <div key={i} className="w-full bg-white/10 backdrop-blur-md p-4 rounded-xl font-medium border border-white/10 flex items-center justify-between">
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 flex gap-4 text-2xl opacity-80">
                    <FaInstagram /> <FaLinkedin />
                  </div>
                  
                  <div className="mt-8 bg-white/10 p-3 rounded-lg border border-white/10 w-full">
                      <p className="text-xs uppercase tracking-widest mb-2 opacity-70">Salvar Contato</p>
                      <button className="bg-white text-blue-900 w-full py-2 rounded font-bold text-sm flex items-center justify-center gap-2">
                          <FaAddressCard /> Adicionar à Agenda
                      </button>
                  </div>
                </div>
              </div>
            </motion.div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[80%] bg-blue-500/20 blur-[100px] -z-10 rounded-full"></div>
          </div>
        </div>
      </div>
    </section>
  );
};

// Seção de Funcionalidades (ATUALIZADA)
const FeaturesSection = () => {
  const features = [
    {
      icon: <FaAddressCard className="text-blue-500" />,
      title: "Botão Salvar Contato",
      desc: "Seu cliente clica e salva seu nome, telefone e email direto na agenda do celular dele. Chega de perder contatos!"
    },
    {
      icon: <FaQrcode className="text-gray-800" />,
      title: "QR Code Automático",
      desc: "Baixe o QR Code do seu perfil, imprima e cole no balcão da sua loja ou cartão de visita. Conecte o mundo físico ao digital."
    },
    {
      icon: <FaChartLine className="text-green-500" />,
      title: "Gráficos de Acesso",
      desc: "Não chute, meça. Veja gráficos visuais de quantos cliques você teve e saiba o que seus clientes mais buscam."
    },
    {
      icon: <FaMobileAlt className="text-purple-500" />,
      title: "Instalável como App",
      desc: "Tecnologia PWA: você e seus clientes podem instalar sua página como um aplicativo nativo no celular."
    }
  ];

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Ferramentas de Nível Pro</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Muito mais que apenas links. Um ecossistema completo para o seu negócio crescer.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <motion.div 
              key={index}
              whileHover={{ y: -5 }}
              className="p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all"
            >
              <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center text-3xl mb-4 border border-gray-100">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// NOVA SEÇÃO: TUTORIAL PASSO A PASSO
const TutorialSection = () => {
    const steps = [
        { num: 1, title: "Crie sua Conta", desc: "Entre com o Google em segundos. Sem formulários longos." },
        { num: 2, title: "Personalize", desc: "Escolha um tema, coloque sua foto e adicione seus links (Zap, Insta, etc)." },
        { num: 3, title: "Compartilhe", desc: "Copie seu link curto ou baixe o QR Code e espalhe por aí!" },
    ];

    return (
        <section id="tutorial" className="py-20 bg-blue-50 border-y border-blue-100">
            <div className="container mx-auto px-4">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-bold text-gray-900">Comece em 3 Passos Simples</h2>
                    <p className="text-gray-600">Não precisa ser expert em tecnologia.</p>
                </div>
                
                <div className="flex flex-col md:flex-row justify-center items-start gap-8 md:gap-12 relative">
                    {/* Linha conectora (visível apenas desktop) */}
                    <div className="hidden md:block absolute top-8 left-20 right-20 h-1 bg-blue-200 -z-10"></div>

                    {steps.map((step) => (
                        <div key={step.num} className="flex-1 flex flex-col items-center text-center bg-white/50 backdrop-blur p-6 rounded-2xl border border-white/50 shadow-sm md:bg-transparent md:border-0 md:shadow-none">
                            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold shadow-lg mb-6 border-4 border-white">
                                {step.num}
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
                            <p className="text-gray-600">{step.desc}</p>
                        </div>
                    ))}
                </div>
                
                <div className="text-center mt-12">
                    <Link href="/admin/login" className="text-blue-600 font-bold hover:underline">
                        Ver tutorial completo em vídeo &rarr;
                    </Link>
                </div>
            </div>
        </section>
    );
};

// Seção de Vídeo (LOCAL)
const VideoSection = () => {
  return (
    <section className="py-20 bg-gray-900 text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
      <div className="container mx-auto px-4 relative z-10 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-8">Veja a plataforma por dentro</h2>
        
        <div className="max-w-4xl mx-auto aspect-video bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-700 relative group">
          <video 
            className="w-full h-full object-cover"
            controls 
            preload="metadata"
            poster="/poster-video.jpg" // Opcional: Adicione uma imagem chamada poster-video.jpg na pasta public
          >
            <source src="video.mp4" type="video/mp4" />
            Seu navegador não suporta a tag de vídeo.
          </video>
        </div>
      </div>
    </section>
  );
};

// Seção CTA Final
const CTASection = () => (
  <section className="py-24 bg-blue-600 text-white relative overflow-hidden">
    <div className="absolute top-0 left-0 w-full h-full bg-[url('/public/window.svg')] opacity-10"></div>
    <div className="container mx-auto px-4 text-center relative z-10">
      <h2 className="text-3xl md:text-5xl font-bold mb-6">Pronto para organizar sua vida digital?</h2>
      <p className="text-blue-100 text-lg mb-10 max-w-2xl mx-auto">
        Junte-se a milhares de profissionais que usam o Meus Links Pro.
      </p>
      <Link 
        href="/admin/login"
        className="inline-block bg-white text-blue-600 text-lg font-bold px-10 py-4 rounded-full shadow-2xl hover:bg-gray-100 transform hover:scale-105 transition-all"
      >
        Criar Minha Página Grátis
      </Link>
      <p className="mt-6 text-sm text-blue-200 opacity-80">
        <FaCheckCircle className="inline mr-1" /> Plano Gratuito disponível para sempre
      </p>
    </div>
  </section>
);

// Footer
const Footer = () => (
  <footer className="bg-gray-50 py-12 border-t border-gray-200">
    <div className="container mx-auto px-4 text-center text-gray-500">
      <div className="flex items-center justify-center gap-2 mb-4 font-bold text-gray-800 text-xl">
        Meus Links Pro
      </div>
      <p className="mb-8 text-sm">Feito por Carioca Tech. Tecnologia de ponta para o seu negócio.</p>
      <div className="flex justify-center gap-6 mb-8">
        <a href="#" className="hover:text-blue-600 transition"><FaInstagram size={24} /></a>
        <a href="#" className="hover:text-blue-600 transition"><FaWhatsapp size={24} /></a>
        <a href="#" className="hover:text-blue-600 transition"><FaLinkedin size={24} /></a>
      </div>
      <p className="text-xs">&copy; {new Date().getFullYear()} Meus Links Pro. Todos os direitos reservados.</p>
    </div>
  </footer>
);

export default function LandingPage() {
  return (
    <div className="font-sans text-gray-900 bg-white min-h-screen selection:bg-blue-100 selection:text-blue-900">
      <Header />
      <main>
        <HeroSection />
        <FeaturesSection />
        <TutorialSection /> {/* Nova Seção Adicionada */}
        <VideoSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}