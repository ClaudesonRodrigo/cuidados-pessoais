// components/VideoShowcase.tsx
import React from 'react';

interface VideoShowcaseProps {
  title?: string;
  description?: string;
}

const VideoShowcase: React.FC<VideoShowcaseProps> = ({ 
  title = "Diagnóstico Especializado", 
  description = "Entenda a importância de um atendimento técnico preciso e especializado." 
}) => {
  return (
    <section className="w-full max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col gap-6">
        {/* Cabeçalho da Seção */}
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            {title}
          </h2>
          <p className="text-slate-600 text-sm md:text-base">
            {description}
          </p>
        </div>

        {/* Container do Vídeo com Aspect Ratio para Responsividade */}
        <div className="relative w-full pb-[56.25%] h-0 rounded-2xl overflow-hidden shadow-2xl bg-slate-200">
          <iframe
            className="absolute top-0 left-0 w-full h-full border-0"
            src="https://www.youtube.com/embed/rSmsouRQm3s?si=NutKQOQ1WnwRLAhL"
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>

        {/* Nota de rodapé ou Call to Action (Opcional) */}
        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
          <p className="text-sm text-amber-800 italic">
            "Não basta o jaleco, é preciso a especialidade certa para o diagnóstico correto."
          </p>
        </div>
      </div>
    </section>
  );
};

export default VideoShowcase;