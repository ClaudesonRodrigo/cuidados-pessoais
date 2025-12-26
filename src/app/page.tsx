// src/app/page.tsx
'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  FaCut, FaCalendarAlt, FaWhatsapp, FaCheck, FaRocket, FaMobileAlt, FaMoneyBillWave, FaArrowRight, FaHeadset, FaCogs 
} from 'react-icons/fa';

export default function Home() {
  
  const features = [
    {
      icon: <FaCalendarAlt className="text-4xl text-orange-500 mb-4" />,
      title: "Agenda Automática",
      desc: "Seus clientes agendam sozinhos pelo link. Chega de ficar respondendo 'tem horário?' no WhatsApp o dia todo."
    },
    {
      icon: <FaMoneyBillWave className="text-4xl text-green-500 mb-4" />,
      title: "Controle Financeiro",
      desc: "Saiba exatamente quanto você faturou no dia. Confirme pagamentos via Pix e veja seu negócio crescer."
    },
    {
      icon: <FaMobileAlt className="text-4xl text-blue-500 mb-4" />,
      title: "Cardápio de Serviços",
      desc: "O cliente escolhe Cabelo + Barba + Sobrancelha e o sistema calcula o tempo total e o valor automaticamente."
    }
  ];

  const plans = [
    {
      name: "Barber Pro",
      price: "R$ 29,90",
      period: "/mês",
      features: [
        "7 Dias de Teste Grátis",
        "Agenda Ilimitada", 
        "Validação de Pix", 
        "Link Personalizado",
        "Dashboard Financeiro",
        "Suporte via WhatsApp"
      ],
      cta: "Testar Grátis Agora",
      highlight: true,
      link: "/admin/login"
    },
    {
      name: "Setup VIP",
      price: "R$ 199,00",
      period: "único",
      features: [
        "Nós configuramos TUDO",
        "Cadastro dos seus Serviços",
        "Personalização da Página",
        "Treinamento de Uso",
        "Suporte na Configuração do Pix",
        "Entrega em 24h"
      ],
      cta: "Quero Configuração VIP",
      highlight: false,
      link: "https://wa.me/5579996337995?text=Ola,%20quero%20contratar%20o%20Setup%20VIP%20de%20R$%20199,00"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-orange-500 selection:text-white">
      
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-2 text-2xl font-bold tracking-tighter">
            <FaCut className="text-orange-500" />
            <span>Barber<span className="text-orange-500">Pro</span></span>
          </div>
          <div className="flex gap-4">
            <Link href="/admin/login" className="text-sm font-bold text-gray-300 hover:text-white transition py-2">
              Entrar
            </Link>
            <Link href="/admin/login" className="hidden sm:block bg-white text-gray-900 px-5 py-2 rounded-full text-sm font-bold hover:bg-gray-200 transition">
              Criar Conta
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-600/20 rounded-full blur-[120px] -z-10" />

        <div className="max-w-4xl mx-auto text-center space-y-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-900 border border-gray-800 text-orange-400 text-xs font-bold uppercase tracking-wider"
          >
            <FaRocket /> Teste 7 dias grátis sem compromisso
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight"
          >
            Sua barbearia lotada e <span className="text-transparent bg-clip-text bg-linear-to-r from-orange-400 to-red-600">organizada no automático.</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto"
          >
            Tenha um sistema de agendamento profissional, receba no Pix e fidelize seus clientes. Comece hoje mesmo.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row justify-center gap-4 pt-4"
          >
            <Link href="/admin/login" className="bg-orange-600 hover:bg-orange-700 text-white text-lg font-bold px-8 py-4 rounded-xl shadow-lg shadow-orange-900/30 transition transform hover:-translate-y-1 flex items-center justify-center gap-3">
              Começar Teste Grátis <FaArrowRight />
            </Link>
          </motion.div>
        </div>
      </header>

      {/* MOCKUP / PREVIEW */}
      <section className="px-4 pb-20">
         <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            whileInView={{ opacity: 1, scale: 1 }} 
            viewport={{ once: true }}
            className="max-w-5xl mx-auto bg-gray-900 rounded-2xl border border-gray-800 p-2 shadow-2xl relative"
         >
            <div className="h-8 bg-gray-800 rounded-t-xl flex items-center gap-2 px-4 mb-2">
                <div className="w-3 h-3 rounded-full bg-red-500"/>
                <div className="w-3 h-3 rounded-full bg-yellow-500"/>
                <div className="w-3 h-3 rounded-full bg-green-500"/>
            </div>
            <div className="aspect-video bg-gray-950 rounded-b-xl flex items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-linear-to-t from-gray-900 via-transparent to-transparent z-10"/>
                <div className="text-center z-20 px-4">
                    <FaMobileAlt className="text-6xl text-gray-700 mx-auto mb-4"/>
                    <h3 className="text-2xl font-bold text-gray-500">Agendamento Simplificado</h3>
                    <p className="text-gray-600">Seus clientes agendam em 3 cliques</p>
                </div>
            </div>
         </motion.div>
      </section>

      {/* FEATURES */}
      <section className="py-20 bg-gray-900/50 border-y border-gray-800">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-gray-950 p-8 rounded-2xl border border-gray-800 hover:border-orange-500/50 transition duration-300"
              >
                {f.icon}
                <h3 className="text-xl font-bold mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Planos Simples</h2>
            <p className="text-gray-400">Escolha fazer sozinho ou deixe que a gente faz tudo.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {plans.map((plan, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: i === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className={`p-8 rounded-3xl border flex flex-col h-full ${plan.highlight ? 'bg-gray-900 border-orange-500 relative shadow-2xl shadow-orange-900/20' : 'bg-gray-950 border-gray-800'}`}
              >
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-600 text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider">
                    Recomendado
                  </div>
                )}
                
                <div className="flex items-center gap-3 mb-4">
                    {i === 1 ? <FaCogs className="text-3xl text-gray-500"/> : <FaRocket className="text-3xl text-orange-500"/>}
                    <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                </div>
                
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                  <span className="text-gray-500 mb-1 font-medium">{plan.period}</span>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  {plan.features.map((feat, j) => (
                    <li key={j} className="flex items-center gap-3 text-sm text-gray-300">
                      <FaCheck className={`shrink-0 ${plan.highlight ? 'text-orange-500' : 'text-gray-600'}`} />
                      {feat}
                    </li>
                  ))}
                </ul>

                <Link 
                  href={plan.link}
                  target={i === 1 ? "_blank" : "_self"}
                  className={`w-full py-4 rounded-xl font-bold text-center transition flex items-center justify-center gap-2 ${plan.highlight ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                >
                  {i === 1 && <FaWhatsapp/>} {plan.cta}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-gray-950 border-t border-gray-900 py-10 text-center text-gray-600 text-sm">
        <p>&copy; {new Date().getFullYear()} BarberPro. Todos os direitos reservados.</p>
        <a href="/admin/login" className="text-gray-800 hover:text-gray-500 mt-4 inline-block text-xs">Área do Admin</a>
      </footer>

    </div>
  );
}