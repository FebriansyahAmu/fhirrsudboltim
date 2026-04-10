export default function LoginHeader() {
  return (
    <div className="text-center">
      <div className="mx-auto h-20 w-20 bg-linear-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg mb-6">
        <svg
          className="h-10 w-10 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      </div>

      <h2 className="text-3xl font-bold text-gray-900 mb-2">
        Satu Sehat BOLTIM
      </h2>
      <p className="text-sm text-gray-600 mb-8">
        Platform Integrasi FHIR RSUD Bolaang Mongondow Timur
      </p>
    </div>
  );
}
