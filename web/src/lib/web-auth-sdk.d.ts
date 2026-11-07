interface Window {
  google?: {
    accounts: {
      id: {
        initialize(config: {
          client_id: string;
          nonce: string;
          callback: (response: { credential: string }) => void;
        }): void;
        renderButton(
          element: HTMLElement,
          config: {
            type: string;
            theme: string;
            size: string;
            text: string;
            locale: string;
            width: number;
          },
        ): void;
      };
    };
  };
  AppleID?: {
    auth: {
      init(config: {
        clientId: string;
        redirectURI: string;
        scope: string;
        state: string;
        nonce: string;
        usePopup: boolean;
      }): void;
      signIn(): Promise<{
        authorization: { code: string; id_token: string; state: string };
      }>;
    };
  };
}
