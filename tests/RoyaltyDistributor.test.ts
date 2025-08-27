import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface Contributor {
  contributor: string;
  percentage: number;
}

interface Song {
  title: string;
  artist: string;
  ipfsHash: string;
  contributors: Contributor[];
  createdAt: number;
}

interface RoyaltyRecord {
  amount: number;
  timestamp: number;
  distributor: string;
}

interface ContractState {
  admin: string;
  paused: boolean;
  paymentCounter: number;
  songs: Map<number, Song>;
  royalties: Map<string, RoyaltyRecord>;
  contributorBalances: Map<string, number>;
  stxBalances: Map<string, number>;
}

// Mock contract implementation
class RoyaltyDistributorMock {
  private state: ContractState = {
    admin: "deployer",
    paused: false,
    paymentCounter: 0,
    songs: new Map(),
    royalties: new Map(),
    contributorBalances: new Map(),
    stxBalances: new Map(),
  };

  private ERR_UNAUTHORIZED = 100;
  private ERR_PAUSED = 101;
  private ERR_INVALID_SONG = 102;
  private ERR_INVALID_AMOUNT = 103;
  private ERR_DISTRIBUTION_FAILED = 106;

  constructor() {
    // Initialize a sample song for testing
    this.state.songs.set(1, {
      title: "Test Song",
      artist: "deployer",
      ipfsHash: "QmTestHash1234567890123456789012345678901234",
      contributors: [
        { contributor: "wallet_1", percentage: 60 },
        { contributor: "wallet_2", percentage: 40 },
      ],
      createdAt: 1000,
    });
  }

  distributeRoyalties(caller: string, songId: number, amount: number): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const song = this.state.songs.get(songId);
    if (!song) {
      return { ok: false, value: this.ERR_INVALID_SONG };
    }
    const totalPercentage = song.contributors.reduce((sum, c) => sum + c.percentage, 0);
    if (totalPercentage !== 100) {
      return { ok: false, value: this.ERR_INVALID_SONG };
    }

    for (const contributor of song.contributors) {
      const share = Math.floor((amount * contributor.percentage) / 100);
      if (share <= 0) {
        return { ok: false, value: this.ERR_DISTRIBUTION_FAILED };
      }
      const key = `${songId}-${contributor.contributor}`;
      const currentBalance = this.state.contributorBalances.get(key) ?? 0;
      this.state.contributorBalances.set(key, currentBalance + share);
      const stxBalance = this.state.stxBalances.get(contributor.contributor) ?? 0;
      this.state.stxBalances.set(contributor.contributor, stxBalance + share);
    }

    const paymentId = this.state.paymentCounter;
    this.state.royalties.set(`${songId}-${paymentId}`, {
      amount,
      timestamp: Date.now(),
      distributor: caller,
    });
    this.state.paymentCounter += 1;
    return { ok: true, value: paymentId };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  getRoyaltyHistory(songId: number, paymentId: number): ClarityResponse<RoyaltyRecord | null> {
    return { ok: true, value: this.state.royalties.get(`${songId}-${paymentId}`) ?? null };
  }

  getContributorBalance(songId: number, contributor: string): ClarityResponse<number> {
    return { ok: true, value: this.state.contributorBalances.get(`${songId}-${contributor}`) ?? 0 };
  }

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  getPaymentCounter(): ClarityResponse<number> {
    return { ok: true, value: this.state.paymentCounter };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  contributor1: "wallet_1",
  contributor2: "wallet_2",
  unauthorized: "wallet_3",
};

describe("RoyaltyDistributor Contract", () => {
  let contract: RoyaltyDistributorMock;

  beforeEach(() => {
    contract = new RoyaltyDistributorMock();
    vi.resetAllMocks();
  });

  it("should initialize with correct state", () => {
    expect(contract.getAdmin()).toEqual({ ok: true, value: "deployer" });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
    expect(contract.getPaymentCounter()).toEqual({ ok: true, value: 0 });
  });

  it("should distribute royalties correctly", () => {
    const result = contract.distributeRoyalties(accounts.deployer, 1, 1000);
    expect(result).toEqual({ ok: true, value: 0 });
    expect(contract.getContributorBalance(1, accounts.contributor1)).toEqual({ ok: true, value: 600 });
    expect(contract.getContributorBalance(1, accounts.contributor2)).toEqual({ ok: true, value: 400 });
    const history = contract.getRoyaltyHistory(1, 0);
    expect(history).toEqual({
      ok: true,
      value: expect.objectContaining({
        amount: 1000,
        distributor: accounts.deployer,
      }),
    });
  });

  it("should prevent distribution when paused", () => {
    contract.pauseContract(accounts.deployer);
    const result = contract.distributeRoyalties(accounts.deployer, 1, 1000);
    expect(result).toEqual({ ok: false, value: 101 });
  });

  it("should prevent distribution for invalid song", () => {
    const result = contract.distributeRoyalties(accounts.deployer, 999, 1000);
    expect(result).toEqual({ ok: false, value: 102 });
  });

  it("should prevent distribution with zero amount", () => {
    const result = contract.distributeRoyalties(accounts.deployer, 1, 0);
    expect(result).toEqual({ ok: false, value: 103 });
  });

  it("should allow admin to pause and unpause contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: true });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent non-admin from pausing contract", () => {
    const pauseResult = contract.pauseContract(accounts.unauthorized);
    expect(pauseResult).toEqual({ ok: false, value: 100 });
  });

  it("should allow admin to change admin", () => {
    const result = contract.setAdmin(accounts.deployer, accounts.contributor1);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getAdmin()).toEqual({ ok: true, value: accounts.contributor1 });
  });

  it("should prevent non-admin from changing admin", () => {
    const result = contract.setAdmin(accounts.unauthorized, accounts.contributor1);
    expect(result).toEqual({ ok: false, value: 100 });
  });

  it("should track multiple distributions", () => {
    contract.distributeRoyalties(accounts.deployer, 1, 1000);
    contract.distributeRoyalties(accounts.deployer, 1, 500);
    expect(contract.getPaymentCounter()).toEqual({ ok: true, value: 2 });
    expect(contract.getContributorBalance(1, accounts.contributor1)).toEqual({ ok: true, value: 900 }); // 600 + 300
    expect(contract.getContributorBalance(1, accounts.contributor2)).toEqual({ ok: true, value: 600 }); // 400 + 200
  });
});